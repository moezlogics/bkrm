import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import UserReport from "@/models/UserReport";
import Listing from "@/models/Listing";
import { requireAuth } from "@/lib/auth";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import ReportReason from "@/models/ReportReason";

/** GET /api/reports — the ad report reasons managed in Admin → Reports. */
export async function GET() {
  try {
    await dbConnect();
    const rows = await ReportReason.find({}).select("reason").sort({ createdAt: 1 }).lean();
    return NextResponse.json(
      { success: true, data: (rows as { reason: string }[]).map((r) => r.reason).filter(Boolean) },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

/**
 * POST /api/reports — a logged-in user reports a listing or a seller profile.
 * Dedupes one open report per user per target. When a listing collects ≥3
 * distinct reports it's auto-held for moderation (crowd-sourced spam defence).
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    const { type = "listing", itemId, reportedUserId, reason, message } = await req.json();
    if (!reason) return NextResponse.json({ success: false, message: "Please choose a reason" }, { status: 400 });
    if (type === "listing" && !itemId) return NextResponse.json({ success: false, message: "Listing missing" }, { status: 400 });
    if (type === "seller" && !reportedUserId) return NextResponse.json({ success: false, message: "Seller missing" }, { status: 400 });

    await dbConnect();

    if (type === "seller" && reportedUserId === session.userId)
      return NextResponse.json({ success: false, message: "You can't report yourself" }, { status: 400 });

    let ownerId: string | null = null;
    if (type === "listing") {
      const l = await Listing.findById(itemId).select("userId");
      if (!l) return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
      ownerId = l.userId.toString();
      if (ownerId === session.userId) return NextResponse.json({ success: false, message: "You can't report your own listing" }, { status: 400 });
    }

    // Dedupe: one open report per user per target
    const dupeQ: any = { userId: session.userId, type, status: "open" };
    if (type === "listing") dupeQ.itemId = itemId; else dupeQ.reportedUserId = reportedUserId;
    if (await UserReport.findOne(dupeQ)) {
      return NextResponse.json({ success: true, message: "You have already reported this. Thank you." });
    }

    await UserReport.create({
      type, userId: session.userId,
      itemId: type === "listing" ? itemId : undefined,
      // A listing report also records its seller, so complaints about one
      // dealer add up across their ads (Admin → Reports → by seller).
      reportedUserId: type === "seller" ? reportedUserId : ownerId || undefined,
      reason: String(reason).slice(0, 120),
      otherMessage: message ? String(message).slice(0, 500) : undefined,
      status: "open",
    });

    // Crowd-sourced auto-hold for listings
    if (type === "listing") {
      const count = await UserReport.countDocuments({ type: "listing", itemId, status: "open" });
      if (count >= 3) {
        await Listing.updateOne(
          { _id: itemId, status: "approved" },
          { $set: { status: "review" }, $addToSet: { flagReasons: "Multiple user reports" } }
        );
      }
    }

    notifyDiscord({
      title: type === "seller" ? "Seller reported" : "Listing reported",
      category: "reports",
      description: reason,
      url: "/admin/reports",
      color: DISCORD_COLORS.report,
      fields: message ? [{ name: "Detail", value: message }] : undefined,
    });

    return NextResponse.json({ success: true, message: "Report submitted. Thank you — we'll review it." });
  } catch (e: any) {
    console.error("report error:", e);
    return NextResponse.json({ success: false, message: e.message || "Couldn't send the report" }, { status: 500 });
  }
}
