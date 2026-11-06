import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import PushCampaign from "@/models/PushCampaign";
import { requireAdmin } from "@/lib/auth";
import { cleanCampaign } from "@/lib/push/campaign-input";
import { kickPushScheduler } from "@/lib/push/scheduler";

type Ctx = { params: Promise<{ id: string }> };

/** GET — one campaign with live progress. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false }, { status: 404 });
  await dbConnect();
  const c = await PushCampaign.findById(id).lean();
  if (!c) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: c });
}

/**
 * PATCH { action }:
 *   "send"      — send a draft now
 *   "cancel"    — stop a scheduled or sending campaign
 *   "update"    — edit a draft / scheduled campaign (+ mode/sendAt like create)
 *   "duplicate" — copy as a new draft
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  await dbConnect();
  const c: any = await PushCampaign.findById(id).lean();
  if (!c) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  switch (b?.action) {
    case "send": {
      const r = await PushCampaign.updateOne(
        { _id: id, status: { $in: ["draft", "scheduled", "failed"] } },
        { $set: { status: "scheduled", sendAt: new Date(), error: null } },
      );
      if (!r.modifiedCount) return NextResponse.json({ success: false, message: "This campaign can't be sent now" }, { status: 409 });
      after(() => kickPushScheduler());
      return NextResponse.json({ success: true, message: "Sending now" });
    }
    case "cancel": {
      const r = await PushCampaign.updateOne(
        { _id: id, status: { $in: ["scheduled", "sending"] } },
        { $set: { status: "cancelled", lockedBy: null, finishedAt: new Date() } },
      );
      return NextResponse.json({ success: !!r.modifiedCount, message: r.modifiedCount ? "Cancelled" : "Already finished" });
    }
    case "duplicate": {
      const copy = await PushCampaign.create({
        name: `${c.name || c.title} (copy)`, title: c.title, body: c.body, url: c.url, icon: c.icon, image: c.image,
        actions: c.actions, requireInteraction: c.requireInteraction, ttlHours: c.ttlHours, urgency: c.urgency,
        audience: c.audience, status: "draft", createdBy: session.userId,
      });
      return NextResponse.json({ success: true, message: "Copied as a draft", data: copy });
    }
    case "update": {
      if (!["draft", "scheduled"].includes(c.status)) {
        return NextResponse.json({ success: false, message: "Only drafts and scheduled campaigns can be edited" }, { status: 409 });
      }
      const { data, error: bad } = cleanCampaign(b);
      if (!data) return NextResponse.json({ success: false, message: bad }, { status: 400 });
      const set: Record<string, unknown> = { ...data };
      if (b?.mode === "draft") Object.assign(set, { status: "draft", sendAt: null });
      if (b?.mode === "send") Object.assign(set, { status: "scheduled", sendAt: new Date() });
      if (b?.mode === "schedule") {
        const at = new Date(b?.sendAt);
        if (!Number.isFinite(at.getTime()) || at.getTime() < Date.now() - 60_000) {
          return NextResponse.json({ success: false, message: "Pick a time in the future" }, { status: 400 });
        }
        Object.assign(set, { status: "scheduled", sendAt: at });
      }
      const r = await PushCampaign.updateOne({ _id: id, status: { $in: ["draft", "scheduled"] } }, { $set: set });
      if (!r.matchedCount) return NextResponse.json({ success: false, message: "It started sending, so it can't be edited now" }, { status: 409 });
      if (b?.mode === "send") after(() => kickPushScheduler());
      return NextResponse.json({ success: true, message: b?.mode === "send" ? "Sending now" : "Saved" });
    }
  }
  return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
}

/** DELETE — remove a campaign that isn't sending. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false }, { status: 404 });
  await dbConnect();
  const r = await PushCampaign.deleteOne({ _id: id, status: { $ne: "sending" } });
  return NextResponse.json({ success: !!r.deletedCount, message: r.deletedCount ? "Deleted" : "Stop it first, it's sending" });
}
