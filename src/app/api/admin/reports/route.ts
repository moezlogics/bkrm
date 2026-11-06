import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import UserReport from "@/models/UserReport";
import ReportReason from "@/models/ReportReason";
import User from "@/models/User";
import Listing from "@/models/Listing";
import { logAdmin } from "@/lib/admin-log";
import { forgetAccount } from "@/lib/account-state";
import { hideSellerAds } from "@/lib/user-admin";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";

/**
 * Admin → Reports.
 *
 * GET    ?status=open|reviewed|dismissed|all&seller=&page=      the reports, newest first
 * GET    ?view=sellers                                            open reports added up per seller
 * PATCH  { ids, action: "resolve"|"dismiss"|"reopen", hideAd?, blockSeller?, note? }
 * DELETE { reportId }                                             remove a report for good
 *
 * One complaint is an argument; four about the same seller is a decision —
 * so reports are kept (resolved / dismissed) instead of deleted, and counted
 * per seller across their ads.
 */

const oid = (s: string) => new mongoose.Types.ObjectId(s);

/** The seller a report is about: its own field, or (older rows) the reported ad's owner. */
const SELLER_STAGES: any[] = [
  { $lookup: { from: "listings", localField: "itemId", foreignField: "_id", as: "ad", pipeline: [{ $project: { userId: 1 } }] } },
  { $addFields: { sellerId: { $ifNull: ["$reportedUserId", { $first: "$ad.userId" }] } } },
];

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    void ReportReason; void User; void Listing;
    const sp = new URL(req.url).searchParams;

    if (sp.get("view") === "sellers") {
      const rows = await UserReport.aggregate([
        { $match: { status: "open" } },
        ...SELLER_STAGES,
        { $match: { sellerId: { $ne: null } } },
        { $group: { _id: "$sellerId", open: { $sum: 1 }, reporters: { $addToSet: "$userId" }, ads: { $addToSet: "$itemId" }, last: { $max: "$createdAt" }, reasons: { $push: "$reason" } } },
        { $addFields: { reporterCount: { $size: "$reporters" }, adCount: { $size: { $setDifference: ["$ads", [null]] } } } },
        { $sort: { reporterCount: -1, open: -1, last: -1 } },
        { $limit: 100 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u", pipeline: [{ $project: { name: 1, email: 1, phoneNumber: 1, isBlocked: 1, verificationLevel: 1, isShop: 1, shopName: 1, createdAt: 1 } }] } },
      ]).option({ maxTimeMS: 10_000 });
      const total = await UserReport.aggregate([{ $match: { status: "open" } }, ...SELLER_STAGES, { $group: { _id: "$sellerId" } }, { $count: "n" }]).then((r) => r[0]?.n || 0).catch(() => 0);
      return NextResponse.json({
        success: true,
        total,
        data: rows.map((r: any) => {
          const tally = new Map<string, number>();
          for (const x of r.reasons || []) if (x) tally.set(x, (tally.get(x) || 0) + 1);
          return {
            sellerId: String(r._id), seller: r.u[0] || null, open: r.open, reporters: r.reporterCount, ads: r.adCount, last: r.last,
            reasons: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, n]) => ({ reason, n })),
          };
        }),
      });
    }

    const status = sp.get("status") || "open";
    const match: any = status === "all" ? {} : { status };
    const seller = sp.get("seller");
    const limit = Math.min(100, Math.max(10, Number(sp.get("limit")) || 30));
    const page = Math.max(1, Number(sp.get("page")) || 1);
    let sellerMatch: any = null;
    if (seller && mongoose.isValidObjectId(seller)) {
      const ads = (await Listing.find({ userId: oid(seller) }).select("_id").limit(5000).lean()).map((l: any) => l._id);
      sellerMatch = { $or: [{ reportedUserId: oid(seller) }, { itemId: { $in: ads } }] };
    }
    const q = sellerMatch ? { $and: [match, sellerMatch] } : match;

    const [reports, total, open] = await Promise.all([
      UserReport.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate({ path: "userId", model: User, select: "name email" })
        .populate({ path: "reportReasonId", model: ReportReason, select: "reason" })
        .populate({ path: "itemId", model: Listing, select: "name slug status userId mainImage galleryImages" })
        .populate({ path: "reportedUserId", model: User, select: "name email isBlocked verificationLevel" })
        .lean(),
      UserReport.countDocuments(q),
      UserReport.countDocuments(sellerMatch ? { $and: [{ status: "open" }, sellerMatch] } : { status: "open" }),
    ]);

    // How many open reports each reported seller has in total (the number that matters).
    const sellerIds = [...new Set((reports as any[]).map((r) => String(r.reportedUserId?._id || r.itemId?.userId || "")).filter(Boolean))];
    const tallies = sellerIds.length
      ? await UserReport.aggregate([{ $match: { status: "open" } }, ...SELLER_STAGES, { $match: { sellerId: { $in: sellerIds.map(oid) } } }, { $group: { _id: "$sellerId", n: { $sum: 1 } } }])
      : [];
    const openBySeller = new Map(tallies.map((t: any) => [String(t._id), t.n]));
    let owners = new Map<string, any>();
    const missing = (reports as any[]).filter((r) => !r.reportedUserId && r.itemId?.userId).map((r) => r.itemId.userId);
    if (missing.length) owners = new Map(((await User.find({ _id: { $in: missing } }).select("name email isBlocked verificationLevel").lean()) as any[]).map((u) => [String(u._id), u]));

    return NextResponse.json({
      success: true,
      total,
      open,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      data: (reports as any[]).map((r) => {
        const s = r.reportedUserId || (r.itemId?.userId ? owners.get(String(r.itemId.userId)) : null);
        return { ...r, seller: s ? { ...s, openReports: openBySeller.get(String(s._id)) || 0 } : null };
      }),
    });
  } catch (error: any) {
    console.error("GET Admin Reports Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch reports" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const body = await req.json().catch(() => ({}));
    const ids: string[] = (Array.isArray(body?.ids) ? body.ids : [body?.reportId]).map(String).filter((i: string) => mongoose.isValidObjectId(i)).slice(0, 200);
    const action = String(body?.action || "");
    const to = { resolve: "reviewed", dismiss: "dismissed", reopen: "open" }[action] as "reviewed" | "dismissed" | "open" | undefined;
    if (!ids.length || !to) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    await dbConnect();

    const reports: any[] = await UserReport.find({ _id: { $in: ids } }).lean();
    const outcome: string[] = [];

    if (body?.hideAd) {
      const adIds = [...new Set(reports.map((r) => r.itemId && String(r.itemId)).filter(Boolean))];
      let hidden = 0;
      for (const id of adIds) {
        const ad = await Listing.findById(id);
        if (!ad || ad.status === "rejected") continue;
        ad.status = "rejected";
        ad.flagReasons = ["Removed after reports from buyers", ...(ad.flagReasons || [])].slice(0, 5);
        await ad.save();
        hidden += 1;
      }
      if (hidden) outcome.push(`${hidden} ad${hidden === 1 ? "" : "s"} taken down`);
    }

    if (body?.blockSeller) {
      const ownerIds = new Set<string>();
      for (const r of reports) {
        if (r.reportedUserId) ownerIds.add(String(r.reportedUserId));
        else if (r.itemId) {
          const ad: any = await Listing.findById(r.itemId).select("userId").lean();
          if (ad?.userId) ownerIds.add(String(ad.userId));
        }
      }
      for (const uid of ownerIds) {
        if (uid === session.userId) continue;
        const u = await User.findById(uid);
        if (!u || u.role === "admin" || u.isBlocked) continue;
        u.isBlocked = true;
        u.blockReason = String(body?.note || "Reported by buyers").slice(0, 500);
        u.blockedAt = new Date();
        await u.save();
        forgetAccount(u._id);
        const hidden = await hideSellerAds(u._id);
        outcome.push(`${u.name} blocked${hidden ? ` (${hidden} ads hidden)` : ""}`);
        await logAdmin(session, { action: "user.block", targetType: "user", targetId: u._id, targetLabel: `${u.name} (${u.email})`, details: `${u.blockReason} — from Reports${hidden ? `, ${hidden} live ads hidden` : ""}` });
        notifyDiscord({ title: "🚫 Account blocked", description: `**${u.name} (${u.email})** — after buyer reports${hidden ? `\n${hidden} live ads hidden` : ""}`, color: DISCORD_COLORS.security, category: "admin", fields: [{ name: "By", value: session.user?.email || "admin" }] });
      }
    }

    // Closing a report about an ad closes every open report on that ad.
    const adIds = reports.map((r) => r.itemId).filter(Boolean);
    const filter: any = to === "open" ? { _id: { $in: ids } } : { $or: [{ _id: { $in: ids } }, ...(adIds.length ? [{ itemId: { $in: adIds }, status: "open" }] : [])] };
    const r = await UserReport.updateMany(filter, { $set: { status: to } });
    await logAdmin(session, {
      action: `report.${action}`,
      targetType: "report",
      targetId: ids.length === 1 ? ids[0] : null,
      targetLabel: `${r.modifiedCount} report${r.modifiedCount === 1 ? "" : "s"}`,
      details: outcome.join(" · ") || null,
    });
    const verb = { reviewed: "resolved", dismissed: "dismissed", open: "reopened" }[to];
    return NextResponse.json({ success: true, message: [`${r.modifiedCount} report${r.modifiedCount === 1 ? "" : "s"} ${verb}`, ...outcome].join(" · ") + "." });
  } catch (error: any) {
    console.error("PATCH Admin Reports Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update reports" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const body = await req.json().catch(() => ({}));
    const reportId = String(body?.reportId || "");
    if (!mongoose.isValidObjectId(reportId)) return NextResponse.json({ success: false, message: "reportId is required" }, { status: 400 });
    await dbConnect();
    const deleted = await UserReport.findByIdAndDelete(reportId);
    if (!deleted) return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });
    await logAdmin(session, { action: "report.delete", targetType: "report", targetId: reportId, targetLabel: deleted.reason || "Report" });
    return NextResponse.json({ success: true, message: "Report deleted" });
  } catch (error: any) {
    console.error("DELETE Admin Report Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to delete report" }, { status: 500 });
  }
}
