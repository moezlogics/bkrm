import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import User from "@/models/User";
import Listing from "@/models/Listing";
import Invoice from "@/models/Invoice";
import UserReport from "@/models/UserReport";
import ReportReason from "@/models/ReportReason";
import UserPurchasedPackage from "@/models/UserPurchasedPackage";
import PushSubscriber from "@/models/PushSubscriber";
import Favourite from "@/models/Favourite";
import AdminLog from "@/models/AdminLog";

/** GET /api/admin/users/[id] — everything Admin → Users shows about one account. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
  await dbConnect();
  void ReportReason;
  const uid = new mongoose.Types.ObjectId(id);

  const user: any = await User.findById(uid)
    .select("-password -pushDay -pushDayCount -fcmToken -verificationDoc.frontImage -verificationDoc.backImage -verificationDoc.selfieImage -cnicImage -selfieImage")
    .lean();
  if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

  const listingIds = (await Listing.find({ userId: uid }).select("_id").limit(5000).lean()).map((l: any) => l._id);
  const [byStatus, totals, recent, plans, invoices, reportsAgainst, reportsOpen, reportsFiled, recentReports, devices, saved, activity] = await Promise.all([
    Listing.aggregate([{ $match: { userId: uid } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Listing.aggregate([
      { $match: { userId: uid } },
      { $group: { _id: null, views: { $sum: "$clicks" }, impressions: { $sum: "$impressions" }, saves: { $sum: "$favouritesCount" }, calls: { $sum: "$phoneClicks" }, whatsapp: { $sum: "$whatsappClicks" }, chats: { $sum: "$chatClicks" } } },
    ]),
    Listing.find({ userId: uid }).sort({ createdAt: -1 }).limit(12)
      .select("name slug status price mainImage galleryImages createdAt expiresAt clicks phoneClicks whatsappClicks chatClicks isFeatured featuredExpiresAt blockHidden flagReasons").lean(),
    UserPurchasedPackage.find({ userId: uid }).sort({ createdAt: -1 }).limit(6).select("planName status startDate endDate listingLimit featuredLimit featuredUsed invoiceId").lean(),
    Invoice.find({ userId: uid }).sort({ createdAt: -1 }).limit(10).select("invoiceNumber planName amount status createdAt reviewedAt").lean(),
    UserReport.countDocuments({ $or: [{ reportedUserId: uid }, { itemId: { $in: listingIds } }] }),
    UserReport.countDocuments({ status: "open", $or: [{ reportedUserId: uid }, { itemId: { $in: listingIds } }] }),
    UserReport.countDocuments({ userId: uid }),
    UserReport.find({ $or: [{ reportedUserId: uid }, { itemId: { $in: listingIds } }] }).sort({ createdAt: -1 }).limit(5)
      .populate({ path: "reportReasonId", model: ReportReason, select: "reason" })
      .populate({ path: "itemId", model: Listing, select: "name slug" })
      .select("type reason otherMessage status createdAt itemId reportReasonId").lean(),
    PushSubscriber.countDocuments({ userId: uid, status: "active" }),
    Favourite.countDocuments({ userId: uid }),
    AdminLog.find({ targetType: "user", targetId: id }).sort({ createdAt: -1 }).limit(10).select("action adminName adminEmail details createdAt").lean(),
  ]);

  const status: Record<string, number> = {};
  for (const s of byStatus as any[]) status[s._id] = s.n;
  const t: any = totals[0] || {};
  const now = Date.now();
  const active = (plans as any[]).find((p) => p.status === "active" && +new Date(p.endDate) > now) || null;

  return NextResponse.json({
    success: true,
    data: {
      user,
      ads: {
        status,
        total: Object.values(status).reduce((a, b) => a + b, 0),
        views: t.views || 0,
        impressions: t.impressions || 0,
        saves: t.saves || 0,
        leads: { calls: t.calls || 0, whatsapp: t.whatsapp || 0, chats: t.chats || 0 },
        recent: (recent as any[]).map((l) => ({ ...l, image: l.mainImage || l.galleryImages?.[0] || null, galleryImages: undefined })),
      },
      plan: active,
      planHistory: plans,
      invoices,
      reports: { against: reportsAgainst, open: reportsOpen, filed: reportsFiled, recent: recentReports },
      devices,
      saved,
      activity,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
