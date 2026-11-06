/**
 * Ads expire, the way buyers expect on a classifieds site: a live ad stays up
 * for "Ad expiry (days)" (Admin → Settings, `listing_expiry_days`; 0 = never)
 * and then goes out of search, archives and the sitemap. Its page still
 * answers ("This listing has expired" with similar live ads), and the seller
 * can renew it from their dashboard within "Reactivation window (days)"
 * (`expired_reactivation_days`; 0 = any time). Expired ads don't use a slot
 * of the seller's allowance.
 *
 * Run every few minutes by the background worker (lib/jobs). Every step is an
 * idempotent update, so it is safe with several processes running it:
 *   1. a live ad without an end date gets one (newly approved or relisted ads,
 *      and every ad that was live before expiry was switched on — so nothing
 *      disappears at once);
 *   2. the admins' own ads never expire;
 *   3. live ads past their end date become `expired`, and the seller is told;
 *   4. sellers are reminded two days before.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import Setting from "@/models/Setting";
import { markCountsStale } from "@/lib/scope-counts";

const DAY = 864e5;
const REMIND_BEFORE_MS = 2 * DAY;
/** A live ad can be renewed this close to its end date. */
export const RENEW_EARLY_MS = 3 * DAY;

export interface ExpirySettings {
  /** Days an ad stays live; 0 = ads never expire. */
  days: number;
  /** Days after expiry an ad can still be renewed; 0 = any time. */
  renewDays: number;
}

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
};

/** Straight from the collection: also used outside any request. */
export async function expirySettings(): Promise<ExpirySettings> {
  await dbConnect();
  const docs: any[] = await Setting.find({ key: { $in: ["listing_expiry_days", "expired_reactivation_days"] } }).lean();
  const by = new Map(docs.map((d) => [d.key, d.value]));
  return { days: num(by.get("listing_expiry_days") ?? 30, 30), renewDays: num(by.get("expired_reactivation_days") ?? 30, 30) };
}

/** Why an ad can't be renewed now, or null when it can. */
export function renewBlocker(ad: { status: string; expiresAt?: Date | string | null }, s: ExpirySettings, now = Date.now()): string | null {
  if (s.days <= 0) return "Ads don't expire on this site, so there is nothing to renew.";
  const end = ad.expiresAt ? +new Date(ad.expiresAt) : 0;
  if (ad.status === "expired") {
    if (s.renewDays > 0 && end && now - end > s.renewDays * DAY) {
      return `This ad expired more than ${s.renewDays} days ago and can't be renewed. Post it again as a new ad.`;
    }
    return null;
  }
  if (ad.status === "approved") {
    if (end && end - now <= RENEW_EARLY_MS) return null;
    return "This ad is live — you can renew it in the last 3 days before it expires.";
  }
  return "Only live or expired ads can be renewed.";
}

export interface ExpiryRun {
  dated: number;
  expired: number;
  reminded: number;
}

const g = globalThis as unknown as { __expiryRunning?: boolean };

export async function runListingExpiry(): Promise<ExpiryRun | null> {
  if (g.__expiryRunning) return null;
  g.__expiryRunning = true;
  try {
    await dbConnect();
    const s = await expirySettings();
    const now = Date.now();
    if (s.days <= 0) {
      // Switched off: live ads have no end date.
      await Listing.updateMany({ status: "approved", expiresAt: { $ne: null } }, { $set: { expiresAt: null } });
      return { dated: 0, expired: 0, reminded: 0 };
    }

    const admins = (await User.find({ role: "admin" }).select("_id").lean()).map((u: any) => u._id as mongoose.Types.ObjectId);
    const dated = (await Listing.updateMany(
      { status: "approved", expiresAt: null, userId: { $nin: admins } },
      { $set: { expiresAt: new Date(now + s.days * DAY) } },
    )).modifiedCount;
    if (admins.length) await Listing.updateMany({ status: "approved", userId: { $in: admins }, expiresAt: { $ne: null } }, { $set: { expiresAt: null } });

    const due: any[] = await Listing.find({ status: "approved", expiresAt: { $lte: new Date(now) } })
      .select("_id name slug userId mainImage").limit(2000).lean();
    let expired = 0;
    if (due.length) {
      expired = (await Listing.updateMany({ _id: { $in: due.map((d) => d._id) }, status: "approved" }, { $set: { status: "expired" } })).modifiedCount;
      if (expired) markCountsStale();
      void tellSellers(due, "ad_expired");
    }

    const soon: any[] = await Listing.find({ status: "approved", expiresAt: { $gt: new Date(now), $lte: new Date(now + REMIND_BEFORE_MS) } })
      .select("_id name slug userId expiresAt").limit(2000).lean();
    let reminded = 0;
    if (soon.length) {
      const { once } = await import("@/lib/push/once");
      const fresh: any[] = [];
      for (const l of soon) if (await once(`expiring:${l._id}:${+new Date(l.expiresAt)}`, 24 * 7)) fresh.push(l);
      reminded = fresh.length;
      if (fresh.length) void tellSellers(fresh, "ad_expiring");
    }

    if (dated || expired || reminded) console.log(`[expiry] ${dated} dated, ${expired} expired, ${reminded} reminded`);
    return { dated, expired, reminded };
  } finally {
    g.__expiryRunning = false;
  }
}

async function tellSellers(ads: any[], type: "ad_expired" | "ad_expiring") {
  try {
    const { pushToUsers } = await import("@/lib/push/notify");
    for (const l of ads) {
      const days = l.expiresAt ? Math.max(1, Math.round((+new Date(l.expiresAt) - Date.now()) / DAY)) : 0;
      await pushToUsers([l.userId], {
        type,
        vars: { listing: l.name, when: days <= 1 ? "tomorrow" : `in ${days} days` },
        url: "/dashboard/seller",
        tag: `expiry:${l._id}`,
      }).catch(() => {});
    }
  } catch (e: any) {
    console.warn("[expiry] seller pushes failed:", e?.message);
  }
}
