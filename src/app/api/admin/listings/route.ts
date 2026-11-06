import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import Listing from "@/models/Listing";
import User from "@/models/User";
import Category from "@/models/Category";
import Favourite from "@/models/Favourite";
import Offer from "@/models/Offer";
import ChatMessage from "@/models/ChatMessage";
import UserReport from "@/models/UserReport";
import { logAdmin } from "@/lib/admin-log";
import { markCountsStale } from "@/lib/scope-counts";
import { deleteFromCdn } from "@/lib/cdn-client";

/**
 * Admin → Listings & Moderation.
 *
 * GET  ?status=review|approved|rejected|sold|expired|all&q=&seller=&category=&flagged=1&sort=&page=&limit=
 *      raw statuses, the spam check's score and reasons, views and leads, the seller's trust.
 * POST { ids: [...], action: "approve" | "reject" | "sold" | "delete", reason? }
 *      each ad is saved one by one, so the seller's push ("your ad is live" /
 *      "needs changes") and the live counts follow as with a single change.
 */

const STATUS: Record<string, string> = { review: "review", pending: "review", approved: "approved", active: "approved", rejected: "rejected", sold: "sold out", expired: "expired" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  views: { clicks: -1 },
  risk: { spamScore: -1, createdAt: -1 },
  price: { price: -1 },
};

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    void User; void Category;
    const sp = new URL(req.url).searchParams;
    const q: any = {};
    const status = sp.get("status") || "review";
    if (status !== "all") q.status = STATUS[status] || "review";
    const seller = sp.get("seller");
    if (seller && mongoose.isValidObjectId(seller)) q.userId = new mongoose.Types.ObjectId(seller);
    const category = sp.get("category");
    if (category && mongoose.isValidObjectId(category)) q.allCategoryIds = category;
    if (sp.get("flagged") === "1") q.spamScore = { $gt: 0 };
    const text = (sp.get("q") || "").trim();
    if (text) {
      if (mongoose.isValidObjectId(text)) q._id = new mongoose.Types.ObjectId(text);
      else q.$or = [{ name: new RegExp(esc(text), "i") }, { slug: new RegExp(`^${esc(text.toLowerCase())}`) }];
    }
    const sort = SORTS[sp.get("sort") || (status === "review" ? "risk" : "newest")] || SORTS.newest;
    const limit = Math.min(100, Math.max(10, Number(sp.get("limit")) || 30));
    const page = Math.max(1, Number(sp.get("page")) || 1);

    const [rows, total, counts] = await Promise.all([
      Listing.find(q).sort(sort).skip((page - 1) * limit).limit(limit).maxTimeMS(8000)
        .select("name slug price priceMode status mainImage galleryImages createdAt expiresAt soldAt clicks impressions phoneClicks whatsappClicks chatClicks favouritesCount spamScore flagReasons blockHidden isFeatured featuredExpiresAt isDemo city userId categoryId")
        .populate({ path: "userId", model: User, select: "name email phoneNumber isBlocked verificationLevel isShop shopName createdAt" })
        .populate({ path: "categoryId", model: Category, select: "name" })
        .lean(),
      Listing.countDocuments(q).maxTimeMS(8000),
      Listing.aggregate([{ $match: seller && mongoose.isValidObjectId(seller) ? { userId: new mongoose.Types.ObjectId(seller) } : {} }, { $group: { _id: "$status", n: { $sum: 1 } } }]).option({ maxTimeMS: 8000 }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const c of counts as any[]) byStatus[c._id] = c.n;

    let sellerInfo = null;
    if (seller && mongoose.isValidObjectId(seller)) sellerInfo = await User.findById(seller).select("name email").lean();

    return NextResponse.json({
      success: true,
      data: (rows as any[]).map((l) => ({
        _id: String(l._id), name: l.name, slug: l.slug, price: l.price, priceMode: l.priceMode, status: l.status,
        image: l.mainImage || l.galleryImages?.[0] || null, photos: (l.galleryImages || []).length || (l.mainImage ? 1 : 0),
        createdAt: l.createdAt, expiresAt: l.expiresAt, soldAt: l.soldAt, city: l.city,
        views: l.clicks || 0, impressions: l.impressions || 0, saves: l.favouritesCount || 0,
        leads: (l.phoneClicks || 0) + (l.whatsappClicks || 0) + (l.chatClicks || 0),
        spamScore: l.spamScore || 0, flagReasons: l.flagReasons || [], blockHidden: !!l.blockHidden, isDemo: !!l.isDemo,
        featured: !!l.isFeatured && (!l.featuredExpiresAt || +new Date(l.featuredExpiresAt) > Date.now()),
        category: l.categoryId?.name || null,
        seller: l.userId ? { _id: String(l.userId._id), name: l.userId.name, email: l.userId.email, phone: l.userId.phoneNumber, blocked: !!l.userId.isBlocked, verified: (l.userId.verificationLevel || 0) >= 2, shop: l.userId.isShop ? l.userId.shopName || "Shop" : null, since: l.userId.createdAt } : null,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts: byStatus,
      seller: sellerInfo,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e: any) {
    console.error("GET admin listings:", e);
    return NextResponse.json({ success: false, message: e.message || "Failed to load listings" }, { status: 500 });
  }
}

const TO: Record<string, "approved" | "rejected" | "sold out"> = { approve: "approved", reject: "rejected", sold: "sold out" };

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const body = await req.json().catch(() => ({}));
    const ids: string[] = (Array.isArray(body?.ids) ? body.ids : []).map(String).filter((i: string) => mongoose.isValidObjectId(i)).slice(0, 200);
    const action = String(body?.action || "");
    const reason = String(body?.reason || "").trim().slice(0, 200);
    if (!ids.length) return NextResponse.json({ success: false, message: "Choose at least one ad." }, { status: 400 });
    if (!TO[action] && action !== "delete") return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
    await dbConnect();

    let done = 0;
    const names: string[] = [];
    if (action === "delete") {
      const items: any[] = await Listing.find({ _id: { $in: ids } }).select("_id name status mainImage galleryImages").lean();
      const found = items.map((i) => i._id);
      // Photos as the single delete does (DELETE /api/ads/[id]).
      for (const i of items) {
        const images: string[] = i.galleryImages?.length ? i.galleryImages : i.mainImage ? [i.mainImage] : [];
        for (const url of images) {
          const file = String(url).split("/").pop();
          if (file) await deleteFromCdn(file).catch(() => {});
        }
      }
      await Listing.deleteMany({ _id: { $in: found } });
      await Promise.all([
        Favourite.deleteMany({ itemId: { $in: found } }),
        Offer.deleteMany({ itemId: { $in: found } }),
        ChatMessage.deleteMany({ itemId: { $in: found } }),
        UserReport.deleteMany({ type: "listing", itemId: { $in: found } }),
      ]);
      if (items.some((i) => i.status === "approved")) markCountsStale();
      done = items.length;
      names.push(...items.map((i) => i.name));
    } else {
      for (const id of ids) {
        const item = await Listing.findById(id);
        if (!item || item.status === TO[action]) continue;
        if (action === "reject" && reason) item.flagReasons = [reason, ...(item.flagReasons || []).filter((r) => r !== reason)].slice(0, 5);
        if (action === "approve") item.blockHidden = undefined;
        item.status = TO[action];
        if (action === "sold") item.soldAt = new Date();
        await item.save();
        done += 1;
        names.push(item.name);
      }
    }

    if (done) {
      await logAdmin(session, {
        action: `listing.${action}`,
        targetType: "listing",
        targetId: ids.length === 1 ? ids[0] : null,
        targetLabel: done === 1 ? names[0] : `${done} ads`,
        details: [reason, done > 1 ? names.slice(0, 8).join(" · ") + (names.length > 8 ? " …" : "") : ""].filter(Boolean).join(" — ") || null,
      });
    }
    const verb = { approve: "approved", reject: "rejected", sold: "marked sold", delete: "deleted" }[action];
    return NextResponse.json({ success: true, message: `${done} ad${done === 1 ? "" : "s"} ${verb}.`, done });
  } catch (e: any) {
    console.error("POST admin listings:", e);
    return NextResponse.json({ success: false, message: e.message || "Action failed" }, { status: 500 });
  }
}
