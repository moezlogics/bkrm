import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import AdminLog from "@/models/AdminLog";

/** GET /api/admin/activity?admin=&type=&action=&target=&q=&page= — the admin activity log, newest first. */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  await dbConnect();
  const sp = new URL(req.url).searchParams;
  const q: any = {};
  const admin = sp.get("admin");
  if (admin && mongoose.isValidObjectId(admin)) q.adminId = new mongoose.Types.ObjectId(admin);
  const type = sp.get("type");
  if (type) q.targetType = type;
  const action = sp.get("action");
  if (action) q.action = action;
  const target = sp.get("target");
  if (target) q.targetId = target;
  const text = (sp.get("q") || "").trim();
  if (text) {
    const re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ targetLabel: re }, { details: re }, { adminEmail: re }, { adminName: re }];
  }
  const limit = 50;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [rows, total, admins] = await Promise.all([
    AdminLog.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(8000).lean(),
    AdminLog.countDocuments(q).maxTimeMS(8000),
    AdminLog.aggregate([{ $group: { _id: "$adminId", name: { $last: "$adminName" }, email: { $last: "$adminEmail" }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 30 }]),
  ]);
  return NextResponse.json({
    success: true,
    data: rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    admins: admins.filter((a: any) => a._id).map((a: any) => ({ _id: String(a._id), name: a.name, email: a.email, n: a.n })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
