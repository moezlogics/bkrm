import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import UserNotification from "@/models/UserNotification";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * GET   /api/notifications?before=<iso>   my notifications, newest first (30 a page)
 * PATCH /api/notifications { ids?: string[], all?: true }   mark as read
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.userId);
  const before = req.nextUrl.searchParams.get("before");
  const q: Record<string, unknown> = { userId: uid };
  if (before && !Number.isNaN(Date.parse(before))) q.createdAt = { $lt: new Date(before) };
  const [rows, unread] = await Promise.all([
    UserNotification.find(q).sort({ createdAt: -1 }).limit(31).select("type title body url icon readAt createdAt").lean(),
    UserNotification.countDocuments({ userId: uid, readAt: null }),
  ]);
  const more = rows.length > 30;
  return NextResponse.json({
    success: true,
    unread,
    more,
    data: rows.slice(0, 30).map((n: any) => ({
      id: String(n._id), type: n.type, title: n.title, body: n.body, url: n.url, icon: n.icon || null,
      read: !!n.readAt, at: n.createdAt,
    })),
  }, { headers: noStore });
}

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.userId);
  const ids = Array.isArray(b.ids) ? b.ids.filter((i: unknown) => mongoose.isValidObjectId(i)).slice(0, 100) : [];
  if (!b.all && !ids.length) return NextResponse.json({ success: false, message: "Nothing to mark" }, { status: 400 });
  const q: Record<string, unknown> = { userId: uid, readAt: null };
  if (!b.all) q._id = { $in: ids.map((i: string) => new mongoose.Types.ObjectId(i)) };
  await UserNotification.updateMany(q, { $set: { readAt: new Date() } });
  const unread = await UserNotification.countDocuments({ userId: uid, readAt: null });
  return NextResponse.json({ success: true, unread }, { headers: noStore });
}
