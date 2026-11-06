import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import dbConnect from "@/lib/mongodb";
import PushCampaign from "@/models/PushCampaign";
import { requireAdmin } from "@/lib/auth";
import { cleanCampaign } from "@/lib/push/campaign-input";
import { kickPushScheduler } from "@/lib/push/scheduler";

/**
 * GET  /api/admin/push/campaigns?page=  — campaign history with results
 * POST /api/admin/push/campaigns        — create: { ...campaign, mode: "draft" | "send" | "schedule", sendAt? }
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  await dbConnect();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const [items, total] = await Promise.all([
    PushCampaign.find().sort({ createdAt: -1 }).skip((page - 1) * 20).limit(20).lean(),
    PushCampaign.estimatedDocumentCount(),
  ]);
  return NextResponse.json({ success: true, data: items, total, page });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const { data, error: bad } = cleanCampaign(b);
  if (!data) return NextResponse.json({ success: false, message: bad }, { status: 400 });

  let status: "draft" | "scheduled" = "draft";
  let sendAt: Date | null = null;
  if (b?.mode === "send") {
    status = "scheduled";
    sendAt = new Date();
  } else if (b?.mode === "schedule") {
    sendAt = new Date(b?.sendAt);
    if (!Number.isFinite(sendAt.getTime()) || sendAt.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ success: false, message: "Pick a time in the future" }, { status: 400 });
    }
    status = "scheduled";
  }
  await dbConnect();
  const c = await PushCampaign.create({ ...data, status, sendAt, createdBy: session.userId });
  if (status === "scheduled" && sendAt!.getTime() <= Date.now() + 1000) after(() => kickPushScheduler());
  return NextResponse.json({
    success: true,
    message: status === "draft" ? "Draft saved" : b?.mode === "send" ? "Sending now" : "Scheduled",
    data: c,
  });
}
