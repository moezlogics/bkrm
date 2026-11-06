/**
 * Timed, personal notifications (run from lib/jobs every 10 minutes):
 *
 *   - boost offer: a day after a free seller's ad goes live, how many people
 *     saw it and that featuring it reaches far more (once per ad);
 *   - unused boosts: a plan with featured slots left and an ad not featured
 *     (at most every 3 days per seller);
 *   - plan ending in 3 days, and plan ended (back to free);
 *   - a message unanswered for 2 hours → the person it's waiting on (once
 *     per conversation a day).
 *
 * Each goes through pushToUsers, so it lands in the bell and on devices,
 * obeys the admin's switches, quiet hours and the daily cap. Every step is
 * de-duplicated with once(), so several processes can run it safely.
 */
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import ChatMessage from "@/models/ChatMessage";
import Package from "@/models/Package";
import UserPurchasedPackage from "@/models/UserPurchasedPackage";
import { pushToUsers } from "@/lib/push/notify";
import { once } from "@/lib/push/once";
import { getPushBranding } from "@/lib/push/config";
import { freeQuota } from "@/lib/plan";
import { isCdnImage, cdnLoader } from "@/lib/cdn-image";

const H = 3_600_000;
const thumb = (src?: string | null) => (!src ? null : isCdnImage(src) ? cdnLoader({ src, width: 160, quality: 75 }) : src);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Free sellers' ads live 20–72 hours, not featured → "reach 3x more buyers". */
async function offerBoosts() {
  const now = Date.now();
  const ads: any[] = await Listing.find({
    status: "approved", isFeatured: { $ne: true }, isDemo: { $ne: true },
    createdAt: { $gte: new Date(now - 72 * H), $lte: new Date(now - 20 * H) },
  }).sort({ createdAt: 1 }).limit(400).select("name slug userId clicks impressions mainImage galleryImages").lean();
  if (!ads.length) return;

  const owners = [...new Set(ads.map((a) => String(a.userId)))];
  const [subs, admins, cheapest, brand] = await Promise.all([
    UserPurchasedPackage.find({ userId: { $in: owners }, status: "active", endDate: { $gt: new Date() } }).select("userId featuredLimit featuredUsed").lean(),
    User.find({ _id: { $in: owners }, role: "admin" }).select("_id").lean(),
    Package.findOne({ status: true, type: "paid", featuredLimit: { $gt: 0 } }).sort({ finalPrice: 1 }).select("finalPrice").lean() as Promise<any>,
    getPushBranding(),
  ]);
  const subOf = new Map((subs as any[]).map((s) => [String(s.userId), s]));
  const isAdmin = new Set((admins as any[]).map((a) => String(a._id)));
  const from = cheapest?.finalPrice ? `${brand.currency} ${Math.round(cheapest.finalPrice).toLocaleString("en-US")}` : "a small price";

  for (const a of ads) {
    const owner = String(a.userId);
    if (isAdmin.has(owner)) continue;
    const sub: any = subOf.get(owner);
    if (sub) {
      const left = Math.max(0, (sub.featuredLimit || 0) - (sub.featuredUsed || 0));
      if (!left || !(await once(`boost-left:${owner}`, 72))) continue;
      await pushToUsers([owner], {
        type: "boost_unused", vars: { listing: a.name, left: plural(left, "boost") },
        url: "/dashboard/seller", tag: `boost-left:${owner}`, icon: thumb(a.mainImage || a.galleryImages?.[0]),
      });
      continue;
    }
    if (!cheapest || !(await once(`boost-offer:${a._id}`, 24 * 30))) continue;
    const seen = Math.max(Number(a.clicks) || 0, Number(a.impressions) || 0);
    await pushToUsers([owner], {
      type: "boost_offer",
      vars: { listing: a.name, views: seen ? seen.toLocaleString("en-US") : "A few", price: from },
      url: `/dashboard/plans?ad=${a._id}`, tag: `boost-offer:${a._id}`, icon: thumb(a.mainImage || a.galleryImages?.[0]),
    });
  }
}

/** Plans ending within 3 days, and plans that have just ended. */
async function remindPlans() {
  const now = Date.now();
  const ending: any[] = await UserPurchasedPackage.find({
    status: "active", endDate: { $gt: new Date(now + 2 * H), $lte: new Date(now + 3 * 24 * H) },
  }).limit(500).select("userId planName endDate").lean();
  for (const s of ending) {
    if (!(await once(`plan-ending:${s._id}`, 24 * 5))) continue;
    const days = Math.ceil((new Date(s.endDate).getTime() - now) / (24 * H));
    await pushToUsers([s.userId], { type: "plan_expiring", vars: { plan: s.planName, when: days <= 1 ? "tomorrow" : `in ${days} days` }, url: "/dashboard/plans", tag: "plan" });
  }

  // Ended on their own (a new plan marks the old one expired itself, without this).
  const ended: any[] = await UserPurchasedPackage.find({ status: "active", endDate: { $lte: new Date(now) } }).limit(500).select("userId planName").lean();
  if (!ended.length) return;
  await UserPurchasedPackage.updateMany({ _id: { $in: ended.map((s) => s._id) }, status: "active" }, { $set: { status: "expired" } });
  const quota = await freeQuota();
  for (const s of ended) {
    // A newer plan already running → nothing to tell.
    if (await UserPurchasedPackage.exists({ userId: s.userId, status: "active", endDate: { $gt: new Date() } })) continue;
    if (!(await once(`plan-ended:${s._id}`, 24 * 30))) continue;
    await pushToUsers([s.userId], { type: "plan_expired", vars: { plan: s.planName, free: plural(quota, "live ad") }, url: "/dashboard/plans", tag: "plan" });
  }
}

/** Messages nobody opened for 2–24 hours → the person they're waiting on. */
async function remindReplies() {
  const now = Date.now();
  const waiting: any[] = await ChatMessage.aggregate([
    { $match: { isRead: false, createdAt: { $gte: new Date(now - 24 * H), $lte: new Date(now - 2 * H) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: { item: "$itemId", from: "$senderId", to: "$receiverId" } } },
    { $limit: 500 },
  ]);
  if (!waiting.length) return;
  const [ads, people] = await Promise.all([
    Listing.find({ _id: { $in: waiting.map((w) => w._id.item) } }).select("name mainImage galleryImages status").lean(),
    User.find({ _id: { $in: waiting.map((w) => w._id.from) } }).select("name").lean(),
  ]);
  const adOf = new Map((ads as any[]).map((a) => [String(a._id), a]));
  const nameOf = new Map((people as any[]).map((p) => [String(p._id), p.name]));
  for (const w of waiting) {
    const ad: any = adOf.get(String(w._id.item));
    if (!ad || ad.status !== "approved") continue;
    const key = `reply:${w._id.item}:${w._id.from}:${w._id.to}`;
    if (!(await once(key, 24))) continue;
    await pushToUsers([w._id.to], {
      type: "reply_reminder",
      vars: { sender: nameOf.get(String(w._id.from)) || "A buyer", listing: ad.name },
      // Threads are "<ad>_<other person>" from the reader's side.
      url: `/chat?threadId=${w._id.item}_${w._id.from}`,
      tag: `chat:${w._id.item}:${w._id.from}`,
      icon: thumb(ad.mainImage || ad.galleryImages?.[0]),
    });
  }
}

export async function runReminders(): Promise<void> {
  await dbConnect();
  for (const [name, step] of [["boosts", offerBoosts], ["plans", remindPlans], ["replies", remindReplies]] as const) {
    await step().catch((e) => console.error(`[reminders] ${name} failed:`, e?.message));
  }
}
