/**
 * Automatic pushes to people (messages, offers, ad updates, price drops…).
 *
 * For every send:
 *   - the type must be switched on in Admin → Push → Automations;
 *   - the person mustn't have switched its category off in their account;
 *   - unless the type is set to "send straight away" (admin, per type), it
 *     respects quiet hours (held and sent when they end) and a daily cap per
 *     person, like large apps do so pushes stay welcome;
 *   - title/body come from the admin-editable templates;
 *   - it is also written to each person's notification list (the bell), so
 *     people without push on a device still get it (not chat messages, which
 *     have their own unread count).
 *
 * Callers never wait on it: use `pushLater()` (fire-and-forget, never throws).
 */
import { randomBytes } from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import PushSubscriber from "@/models/PushSubscriber";
import PushJob from "@/models/PushJob";
import UserNotification from "@/models/UserNotification";
import { AUTO_TYPES, NOT_IN_INBOX, getPushConfig, getPushBranding, renderTemplate, quietUntil, dayKey } from "@/lib/push/config";
import { sendBatch, topicOf, vapidPublicKey, type PushMessage } from "@/lib/push/send";
import { bumpStat } from "@/lib/push/stats";

export type AutoPush = {
  type: keyof typeof AUTO_TYPES | string;
  vars?: Record<string, unknown>;
  /** Where a tap opens (site-relative). */
  url: string;
  image?: string | null;
  /** Small picture next to the text (e.g. the ad's photo); default = site icon. */
  icon?: string | null;
  /** Same tag = the new notification replaces the previous one (e.g. one per chat). */
  tag?: string | null;
  renotify?: boolean;
};

const newId = () => randomBytes(6).toString("base64url");
const oidOrNull = (v: unknown) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);

/**
 * Send one automatic push to several people. `held` = sent from the queue
 * after quiet hours (skips the quiet-hours check it already passed).
 */
export async function pushToUsers(userIds: unknown[], p: AutoPush, held = false): Promise<{ sent: number; held: number }> {
  const def = AUTO_TYPES[p.type];
  const ids = [...new Set(userIds.map(oidOrNull).filter(Boolean).map(String))].map((s) => new mongoose.Types.ObjectId(s));
  if (!def || !ids.length) return { sent: 0, held: 0 };
  const [cfg, brand] = await Promise.all([getPushConfig(), getPushBranding()]);
  // The admin's switch for this type covers the bell too.
  if (!cfg.auto[p.type]?.enabled) return { sent: 0, held: 0 };
  await dbConnect();

  // The bell: everyone gets it, with or without push on a device. Held jobs
  // were already written when they were first sent.
  if (!held && !NOT_IN_INBOX.has(p.type)) {
    const tplIn = cfg.auto[p.type];
    const title = renderTemplate(tplIn.title, p.vars || {}, brand.siteName).slice(0, 200) || brand.siteName;
    const body = renderTemplate(tplIn.body, p.vars || {}, brand.siteName).slice(0, 600);
    await UserNotification.insertMany(
      ids.map((userId) => ({ userId, type: p.type, title, body, url: p.url || "/", icon: p.icon || null })),
      { ordered: false },
    ).catch((e) => console.error("[notify] inbox write failed:", e?.message));
  }

  if (!cfg.enabled || !vapidPublicKey()) return { sent: 0, held: 0 };

  // People who have a device and haven't switched this category off.
  const withDevice = await PushSubscriber.distinct("userId", { userId: { $in: ids }, status: "active" });
  if (!withDevice.length) return { sent: 0, held: 0 };
  let people = (await User.find({ _id: { $in: withDevice }, isBlocked: { $ne: true }, pushOff: { $ne: def.category } }).select("_id").lean()).map((u: any) => u._id);
  if (!people.length) return { sent: 0, held: 0 };

  const immediate = cfg.auto[p.type]?.immediate ?? def.immediate;
  if (!immediate) {
    // Quiet hours: queue it for the morning instead of dropping it.
    const until = held ? null : quietUntil(cfg);
    if (until) {
      const sendAt = new Date(until.getTime() + Math.floor(Math.random() * 20 * 60_000)); // spread the morning wave
      await PushJob.insertMany(people.map((userId: any) => ({ userId, type: p.type, vars: p.vars || {}, url: p.url, image: p.image || null, icon: p.icon || null, tag: p.tag || null, sendAt })), { ordered: false }).catch(() => {});
      return { sent: 0, held: people.length };
    }
    // Daily cap: people already at it today are skipped; the rest use a slot
    // (two bulk queries however many people — a price drop can reach thousands).
    const day = dayKey(cfg.timezone);
    const underCap = { _id: { $in: people }, $or: [{ pushDay: { $ne: day } }, { pushDayCount: { $lt: cfg.dailyCap } }] };
    people = (await User.find(underCap).select("_id").lean()).map((u: any) => u._id);
    if (!people.length) return { sent: 0, held: 0 };
    await User.updateMany({ _id: { $in: people } }, [{
      $set: { pushDayCount: { $cond: [{ $eq: ["$pushDay", day] }, { $add: [{ $ifNull: ["$pushDayCount", 0] }, 1] }, 1] }, pushDay: day },
    }], { updatePipeline: true });
  }

  const subs = await PushSubscriber.find({ userId: { $in: people }, status: "active" }).select("endpoint keys").lean();
  const tpl = cfg.auto[p.type];
  const vars = p.vars || {};
  const message: PushMessage = {
    title: renderTemplate(tpl.title, vars, brand.siteName) || brand.siteName,
    body: renderTemplate(tpl.body, vars, brand.siteName),
    url: p.url,
    icon: p.icon || brand.icon,
    badge: brand.badge || null,
    image: p.image || null,
    tag: p.tag || null,
    renotify: p.renotify,
    type: p.type,
    id: newId(),
  };
  const r = await sendBatch(subs as any, message, {
    urgency: immediate ? "high" : "normal",
    ttlSec: immediate ? 86_400 : 3 * 86_400,
    topic: p.tag ? topicOf(p.tag) : null,
  });
  bumpStat(p.type, { sent: r.sent, failed: r.failed + r.removed });
  return { sent: r.sent, held: 0 };
}

export function pushToUser(userId: unknown, p: AutoPush) {
  return pushToUsers([userId], p);
}

/** Fire-and-forget: never blocks the caller, never throws. */
export function pushLater(userIds: unknown | unknown[], p: AutoPush): void {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  pushToUsers(ids, p).catch((e) => console.error(`[push] ${p.type} failed:`, e?.message));
}
