import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import User from "@/models/User";
import Listing from "@/models/Listing";
import ChatMessage from "@/models/ChatMessage";
import Offer from "@/models/Offer";
import Review from "@/models/Review";
import Favourite from "@/models/Favourite";
import PushSubscriber from "@/models/PushSubscriber";
import UserNotification from "@/models/UserNotification";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";

/**
 * GET /api/admin/users/[id]/full — the rest of what we hold on one account,
 * for the admin's full profile page (the drawer's /api/admin/users/[id] has
 * the summary): CNIC details, every number used on their ads and other
 * accounts using them, conversations, offers, reviews, saved ads, devices,
 * recent notifications and bookings.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
  await dbConnect();
  const uid = new mongoose.Types.ObjectId(id);

  const user: any = await User.findById(uid)
    .select("name email phoneNumber isPhoneVerified bio isSeller verificationStatus verificationLevel verificationDoc isShop shopName shopAddress shopDescription rating ratingCount salesCount createdAt")
    .lean();
  if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

  const [numbers, threads, offersMade, offersGot, offersRecent, reviewsGot, reviewsGiven, reviewsRecent, savedRecent, devices, notes] = await Promise.all([
    Listing.aggregate([
      { $match: { userId: uid } },
      { $project: { n: ["$contactNumber", "$whatsappNumber"] } },
      { $unwind: "$n" },
      { $match: { n: { $nin: [null, ""] } } },
      { $group: { _id: "$n", ads: { $sum: 1 } } },
      { $sort: { ads: -1 } },
      { $limit: 10 },
    ]),
    ChatMessage.aggregate([
      { $match: { $or: [{ senderId: uid }, { receiverId: uid }] } },
      { $sort: { createdAt: -1 } },
      { $project: { itemId: 1, createdAt: 1, message: 1, offerId: 1, isRead: 1, receiverId: 1, other: { $cond: [{ $eq: ["$senderId", uid] }, "$receiverId", "$senderId"] }, mine: { $eq: ["$senderId", uid] } } },
      { $group: {
        _id: { item: "$itemId", other: "$other" },
        count: { $sum: 1 },
        last: { $first: "$message" },
        lastAt: { $first: "$createdAt" },
        lastMine: { $first: "$mine" },
        unreadForThem: { $sum: { $cond: [{ $and: ["$mine", { $not: ["$isRead"] }] }, 1, 0] } },
      } },
      { $sort: { lastAt: -1 } },
      { $limit: 60 },
    ]),
    Offer.countDocuments({ buyerId: uid }),
    Offer.countDocuments({ sellerId: uid }),
    Offer.find({ $or: [{ buyerId: uid }, { sellerId: uid }] }).sort({ createdAt: -1 }).limit(10)
      .populate({ path: "itemId", model: Listing, select: "name slug" })
      .populate({ path: "buyerId", model: User, select: "name" })
      .populate({ path: "sellerId", model: User, select: "name" })
      .select("amount status createdAt itemId buyerId sellerId").lean(),
    Review.aggregate([{ $match: { sellerId: uid } }, { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: "$rating" }, hidden: { $sum: { $cond: [{ $eq: ["$status", "hidden"] }, 1, 0] } } } }]),
    Review.countDocuments({ reviewerId: uid }),
    Review.find({ $or: [{ sellerId: uid }, { reviewerId: uid }] }).sort({ createdAt: -1 }).limit(10)
      .populate({ path: "reviewerId", model: User, select: "name" })
      .populate({ path: "sellerId", model: User, select: "name" })
      .select("rating comment guestName verified dealVerified status createdAt reviewerId sellerId").lean(),
    Favourite.find({ userId: uid }).sort({ createdAt: -1 }).limit(10)
      .populate({ path: "itemId", model: Listing, select: "name slug price status" }).select("itemId createdAt").lean(),
    PushSubscriber.find({ userId: uid }).sort({ lastSeenAt: -1 }).limit(10)
      .select("browser os device city area status createdAt lastSeenAt").lean(),
    UserNotification.find({ userId: uid }).sort({ createdAt: -1 }).limit(15).select("type title createdAt readAt").lean(),
  ]);

  // The same number on someone else's account or ads: a duplicate or a returning blocked seller.
  const nums = [...new Set([user.phoneNumber, ...(numbers as any[]).map((n) => n._id)].filter(Boolean))];
  const [othersByAccount, othersByAds] = nums.length ? await Promise.all([
    User.find({ _id: { $ne: uid }, phoneNumber: { $in: nums } }).select("name email isBlocked phoneNumber").limit(10).lean(),
    Listing.aggregate([
      { $match: { userId: { $ne: uid }, $or: [{ contactNumber: { $in: nums } }, { whatsappNumber: { $in: nums } }] } },
      { $group: { _id: "$userId", ads: { $sum: 1 } } },
      { $limit: 10 },
    ]),
  ]) : [[], []];
  const otherIds = [...new Set([...(othersByAccount as any[]).map((u) => String(u._id)), ...(othersByAds as any[]).map((a) => String(a._id))])];
  const otherUsers: any[] = otherIds.length ? await User.find({ _id: { $in: otherIds } }).select("name email isBlocked").lean() : [];

  // Names and ads for the conversation list.
  const tItems = [...new Set((threads as any[]).map((t) => String(t._id.item)))];
  const tPeople = [...new Set((threads as any[]).map((t) => String(t._id.other)))];
  const [tAds, tUsers] = await Promise.all([
    Listing.find({ _id: { $in: tItems } }).select("name slug userId").lean(),
    User.find({ _id: { $in: tPeople } }).select("name").lean(),
  ]);
  const adOf = new Map((tAds as any[]).map((a) => [String(a._id), a]));
  const nameOf = new Map((tUsers as any[]).map((u) => [String(u._id), u.name]));

  let bookings: any = null;
  if (BOOKINGS_ON) {
    const Booking = (await import("@/models/Booking")).default;
    const [asCustomer, asProvider, recent] = await Promise.all([
      Booking.countDocuments({ customerId: uid }),
      Booking.countDocuments({ providerId: uid }),
      Booking.find({ $or: [{ customerId: uid }, { providerId: uid }] }).sort({ createdAt: -1 }).limit(10)
        .select("code kind status dayLabel listingName customerId providerId estimate shares createdAt").lean(),
    ]);
    bookings = { asCustomer, asProvider, recent: (recent as any[]).map((b) => ({ ...b, role: String(b.customerId) === id ? "customer" : "provider" })) };
  }

  const r: any = (reviewsGot as any[])[0] || {};
  const doc = user.verificationDoc || {};
  return NextResponse.json({
    success: true,
    data: {
      profile: {
        bio: user.bio || null, isSeller: user.isSeller !== false, isShop: !!user.isShop, shopName: user.shopName || null,
        shopAddress: user.shopAddress || null, shopDescription: user.shopDescription || null, salesCount: user.salesCount || 0,
      },
      verification: {
        status: user.verificationStatus || "unverified", level: user.verificationLevel || 0,
        cnicNumber: doc.cnicNumber || null, fullName: doc.fullName || null, frontImage: doc.frontImage || null, backImage: doc.backImage || null,
        submittedAt: doc.submittedAt || null, reviewedAt: doc.reviewedAt || null, rejectionReason: doc.rejectionReason || null,
      },
      phones: {
        account: user.phoneNumber || null, accountVerified: !!user.isPhoneVerified,
        onAds: (numbers as any[]).map((n) => ({ number: n._id, ads: n.ads })),
        others: otherUsers.map((o) => ({ _id: String(o._id), name: o.name, email: o.email, isBlocked: !!o.isBlocked })),
      },
      chats: (threads as any[]).map((t) => {
        const ad: any = adOf.get(String(t._id.item));
        return {
          item: String(t._id.item), other: String(t._id.other), otherName: nameOf.get(String(t._id.other)) || "Deleted account",
          ad: ad ? { name: ad.name, slug: ad.slug } : null, role: ad && String(ad.userId) === id ? "seller" : "buyer",
          count: t.count, last: t.last || "(offer or attachment)", lastAt: t.lastAt, lastMine: t.lastMine, unreadForThem: t.unreadForThem,
        };
      }),
      offers: { made: offersMade, received: offersGot, recent: offersRecent },
      reviews: { received: r.n || 0, average: r.avg ? Math.round(r.avg * 10) / 10 : null, hidden: r.hidden || 0, given: reviewsGiven, recent: reviewsRecent },
      saved: (savedRecent as any[]).filter((f) => f.itemId).map((f) => ({ ...f.itemId, savedAt: f.createdAt })),
      devices,
      notifications: notes,
      bookings,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
