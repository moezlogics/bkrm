import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import PushSubscriber from "@/models/PushSubscriber";
import { requireAuth } from "@/lib/auth";
import { PUSH_CATEGORIES } from "@/lib/push/config";
import { bumpStat } from "@/lib/push/stats";

/**
 * GET    /api/push/prefs          — my notification categories + devices
 * PUT    /api/push/prefs { off }  — categories I've switched off
 * DELETE /api/push/prefs?id=      — stop notifications on one of my devices
 */
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.userId);
  const [user, devices] = await Promise.all([
    User.findById(uid).select("pushOff").lean() as Promise<any>,
    PushSubscriber.find({ userId: uid, status: "active" }).sort({ lastSeenAt: -1 })
      .select("browser os device city area createdAt lastSeenAt endpoint").lean(),
  ]);
  return NextResponse.json({
    success: true,
    categories: Object.entries(PUSH_CATEGORIES).map(([id, c]) => ({ id, ...c })),
    off: user?.pushOff || [],
    devices: (devices as any[]).map((d) => ({
      id: String(d._id), browser: d.browser, os: d.os, device: d.device,
      place: [d.area, d.city].filter(Boolean).join(", "),
      since: d.createdAt, lastSeen: d.lastSeenAt,
      // lets the page mark "this device" without exposing other endpoints
      tail: String(d.endpoint).slice(-24),
    })),
  });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const off = Array.isArray(b?.off) ? [...new Set(b.off.map(String).filter((k: string) => k in PUSH_CATEGORIES))] : [];
  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.userId);
  await Promise.all([
    User.updateOne({ _id: uid }, { $set: { pushOff: off } }),
    PushSubscriber.updateMany({ userId: uid }, { $set: { promoOff: off.includes("promotions") } }),
  ]);
  return NextResponse.json({ success: true, off });
}

export async function DELETE(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false }, { status: 400 });
  await dbConnect();
  const r = await PushSubscriber.updateOne({ _id: id, userId: session.userId, status: "active" }, { $set: { status: "unsubscribed", endedAt: new Date() } });
  if (r.modifiedCount) bumpStat("subscriber", { unsubscribed: 1 });
  return NextResponse.json({ success: true });
}
