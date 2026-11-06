import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import PushSubscriber from "@/models/PushSubscriber";
import { requireAdmin } from "@/lib/auth";
import { cleanCampaign } from "@/lib/push/campaign-input";
import { campaignMessage } from "@/lib/push/campaigns";
import { sendBatch, vapidPublicKey } from "@/lib/push/send";

/**
 * POST /api/admin/push/test { ...campaign, userId? } — preview a campaign on
 * real devices: yours, or one person's. Not counted in campaign stats.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  if (!vapidPublicKey()) {
    return NextResponse.json({ success: false, message: "Push keys aren't configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)" }, { status: 503 });
  }
  const b = await req.json().catch(() => ({}));
  const { data, error: bad } = cleanCampaign({ ...b, audience: { who: "all" } });
  if (!data) return NextResponse.json({ success: false, message: bad }, { status: 400 });
  const target = mongoose.isValidObjectId(b?.userId) ? String(b.userId) : session.userId;
  await dbConnect();
  const subs = await PushSubscriber.find({ userId: target, status: "active" }).select("endpoint keys").lean();
  if (!subs.length) {
    return NextResponse.json({
      success: false,
      message: target === session.userId
        ? "Turn on notifications in this browser first (the bell button on this page)"
        : "That person has no devices with notifications on",
    }, { status: 400 });
  }
  const msg = await campaignMessage({ ...data, _id: new mongoose.Types.ObjectId() });
  const r = await sendBatch(subs as any, { ...msg, type: "test", campaignId: null, id: `t${Date.now()}` }, { urgency: "high", ttlSec: 600 });
  return NextResponse.json({
    success: r.sent > 0,
    message: r.sent ? `Test sent to ${r.sent} device${r.sent > 1 ? "s" : ""}` : "Couldn't reach the device(s)",
  });
}
