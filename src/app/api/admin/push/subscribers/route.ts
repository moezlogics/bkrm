import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import PushSubscriber from "@/models/PushSubscriber";
import User from "@/models/User";
import { requireAdmin } from "@/lib/auth";
import { bumpStat } from "@/lib/push/stats";

/**
 * GET    /api/admin/push/subscribers?status=&who=&city=&state=&device=&q=&page=
 * DELETE /api/admin/push/subscribers?id=  — stop sending to one device
 */
const PAGE = 50;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const p = req.nextUrl.searchParams;
  await dbConnect();
  const f: Record<string, any> = {};
  const status = p.get("status") || "active";
  if (status !== "all") f.status = status;
  const who = p.get("who");
  if (who === "users") f.userId = { $ne: null };
  if (who === "guests") f.userId = null;
  if (who === "sellers") Object.assign(f, { userId: { $ne: null }, isSeller: true });
  if (p.get("city")) f.city = p.get("city");
  if (p.get("state")) f.state = p.get("state");
  if (p.get("device")) f.device = p.get("device");
  if (p.get("browser")) f.browser = p.get("browser");
  const q = (p.get("q") || "").trim();
  if (q) {
    // People by email prefix (index) or name.
    const rx = q.includes("@") ? { email: new RegExp(`^${esc(q.toLowerCase())}`) } : { name: new RegExp(esc(q), "i") };
    const ids = (await User.find(rx).select("_id").limit(200).maxTimeMS(5000).lean()).map((u: any) => u._id);
    f.userId = { $in: ids };
  }
  const page = Math.max(1, Number(p.get("page")) || 1);
  const [items, total] = await Promise.all([
    PushSubscriber.find(f).sort({ _id: -1 }).skip((page - 1) * PAGE).limit(PAGE)
      .select("-keys -endpoint").populate({ path: "userId", model: User, select: "name email" }).maxTimeMS(10_000).lean(),
    PushSubscriber.countDocuments(f).maxTimeMS(10_000),
  ]);
  return NextResponse.json({ success: true, data: items, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false }, { status: 400 });
  await dbConnect();
  const r = await PushSubscriber.updateOne({ _id: id, status: "active" }, { $set: { status: "unsubscribed", endedAt: new Date() } });
  if (r.modifiedCount) bumpStat("subscriber", { unsubscribed: 1 });
  return NextResponse.json({ success: true, message: "Removed" });
}
