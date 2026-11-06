import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import dbConnect from "@/lib/mongodb";
import PushSubscriber from "@/models/PushSubscriber";
import { requireAdmin } from "@/lib/auth";
import { getPushBranding } from "@/lib/push/config";
import { sendBatch, vapidPublicKey } from "@/lib/push/send";

/** POST /api/push/test — an admin's own devices only (a debugging tool, not a member feature). */
export async function POST() {
  const { session, error } = await requireAdmin();
  if (error) return error;
  if (!vapidPublicKey()) return NextResponse.json({ success: false, message: "Notifications aren't set up on this site yet" }, { status: 503 });
  await dbConnect();
  const subs = await PushSubscriber.find({ userId: session.userId, status: "active" }).select("endpoint keys").lean();
  if (!subs.length) return NextResponse.json({ success: false, message: "Turn on notifications on this device first" }, { status: 400 });
  const brand = await getPushBranding();
  const r = await sendBatch(subs as any, {
    title: brand.siteName, body: "Test notification — notifications are working on this device.",
    url: "/dashboard/notifications/settings", icon: brand.icon, badge: brand.badge || null, type: "test", id: randomBytes(6).toString("base64url"),
  }, { urgency: "high", ttlSec: 600 });
  return NextResponse.json({ success: r.sent > 0, sent: r.sent, message: r.sent ? `Sent to ${r.sent} device${r.sent > 1 ? "s" : ""}` : "Couldn't reach your devices" });
}
