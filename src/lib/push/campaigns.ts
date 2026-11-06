/**
 * Manual campaigns: audience → database filter, audience size, and the
 * background sender.
 *
 * The sender walks matching subscribers in _id order, 500 at a time, and
 * saves its position (`cursor`) and a heartbeat after every batch. If the
 * process stops mid-send, the scheduler in another process sees the stale
 * heartbeat and continues from the cursor — nobody gets it twice, nobody is
 * skipped. Cancelling takes effect at the next batch.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import PushCampaign, { type Audience } from "@/models/PushCampaign";
import PushSubscriber from "@/models/PushSubscriber";
import { getPushBranding } from "@/lib/push/config";
import { sendBatch, type PushMessage } from "@/lib/push/send";
import { bumpStat } from "@/lib/push/stats";

const BATCH = 500;
const oids = (a?: string[]) => (a || []).filter((x) => mongoose.isValidObjectId(x)).map((x) => new mongoose.Types.ObjectId(x));
const list = (a?: string[]) => (a || []).map((x) => String(x).trim()).filter(Boolean);

/** Subscriber filter for an audience (only active devices, never people who opted out of promotions). */
export function audienceFilter(a: Audience): Record<string, any> {
  const f: Record<string, any> = { status: "active", promoOff: { $ne: true } };
  switch (a?.who) {
    case "users": f.userId = { $ne: null }; break;
    case "guests": f.userId = null; break;
    case "sellers": f.userId = { $ne: null }; f.isSeller = true; break;
    case "buyers": f.userId = { $ne: null }; f.isSeller = { $ne: true }; break;
    case "specific": f.userId = { $in: oids(a.userIds) }; break;
  }
  if (list(a?.areaIds).length) f.areaId = { $in: oids(a.areaIds) };
  else if (list(a?.cityIds).length) f.cityId = { $in: oids(a.cityIds) };
  if (list(a?.states).length) f.state = { $in: list(a.states) };
  if (list(a?.devices).length) f.device = { $in: list(a.devices) };
  if (list(a?.browsers).length) f.browser = { $in: list(a.browsers) };
  if (list(a?.os).length) f.os = { $in: list(a.os) };
  if (a?.activeWithinDays && a.activeWithinDays > 0) f.lastSeenAt = { $gte: new Date(Date.now() - a.activeWithinDays * 86_400_000) };
  return f;
}

export async function estimateAudience(a: Audience): Promise<number> {
  await dbConnect();
  return PushSubscriber.countDocuments(audienceFilter(a)).maxTimeMS(10_000);
}

/** The notification a campaign sends (brand icon unless the campaign sets one). */
export async function campaignMessage(c: any): Promise<PushMessage> {
  const brand = await getPushBranding();
  return {
    title: c.title,
    body: c.body,
    url: c.url || "/",
    icon: c.icon || brand.icon,
    badge: brand.badge || null,
    image: c.image || null,
    actions: c.actions || [],
    requireInteraction: !!c.requireInteraction,
    tag: `campaign:${c._id}`,
    type: "campaign",
    campaignId: String(c._id),
    id: `c${c._id}`,
  };
}

const workerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Claim one campaign that's due (or whose sender went quiet) and send it to
 * completion. Returns false when there was nothing to do.
 */
export async function runNextCampaign(): Promise<boolean> {
  await dbConnect();
  const now = new Date();
  const c: any = await PushCampaign.findOneAndUpdate(
    {
      $or: [
        { status: "scheduled", sendAt: { $lte: now } },
        { status: "sending", heartbeatAt: { $lt: new Date(now.getTime() - 180_000) } },
      ],
    },
    [{ $set: { status: "sending", lockedBy: workerId, heartbeatAt: now, startedAt: { $ifNull: ["$startedAt", now] } } }],
    { sort: { sendAt: 1 }, new: true, updatePipeline: true },
  ).lean();
  if (!c) return false;

  try {
    const base = audienceFilter(c.audience || { who: "all" });
    if (!c.cursor) {
      const targeted = await PushSubscriber.countDocuments(base);
      await PushCampaign.updateOne({ _id: c._id }, { $set: { "stats.targeted": targeted } });
    }
    const message = await campaignMessage(c);
    const opts = { ttlSec: Math.max(1, c.ttlHours || 24) * 3600, urgency: c.urgency || "normal" } as const;
    let cursor = c.cursor as mongoose.Types.ObjectId | null;

    for (;;) {
      // Stop promptly if an admin cancelled, or another worker took over.
      const live: any = await PushCampaign.findById(c._id).select("status lockedBy").lean();
      if (!live || live.status !== "sending" || live.lockedBy !== workerId) return true;

      const batch = await PushSubscriber.find(cursor ? { ...base, _id: { $gt: cursor } } : base)
        .sort({ _id: 1 }).limit(BATCH).select("endpoint keys").lean();
      if (!batch.length) break;
      const r = await sendBatch(batch as any, message, opts, 80);
      cursor = batch[batch.length - 1]._id as mongoose.Types.ObjectId;
      await PushCampaign.updateOne(
        { _id: c._id, lockedBy: workerId },
        { $inc: { "stats.sent": r.sent, "stats.failed": r.failed, "stats.removed": r.removed }, $set: { cursor, heartbeatAt: new Date() } },
      );
      bumpStat("campaign", { sent: r.sent, failed: r.failed + r.removed });
      await new Promise((res) => setImmediate(res)); // let page requests in between batches
    }
    await PushCampaign.updateOne({ _id: c._id, lockedBy: workerId }, { $set: { status: "sent", finishedAt: new Date(), lockedBy: null } });
  } catch (e: any) {
    console.error("[push] campaign failed:", e?.message);
    await PushCampaign.updateOne({ _id: c._id, lockedBy: workerId }, { $set: { status: "failed", error: String(e?.message || e).slice(0, 300), lockedBy: null } });
  }
  return true;
}
