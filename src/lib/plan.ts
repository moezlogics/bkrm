/**
 * Plan entitlements (server-only).
 * Resolves a seller's current listing/feature allowance from their active
 * subscription, falling back to the free tier (Setting `default_free_ad_quota`).
 */
import UserPurchasedPackage from "@/models/UserPurchasedPackage";
import Listing from "@/models/Listing";
import Setting from "@/models/Setting";

export async function getActiveSubscription(userId: string) {
  return UserPurchasedPackage.findOne({ userId, status: "active", endDate: { $gt: new Date() } }).sort({ endDate: -1 });
}

export interface PaymentMethod { type: string; title: string; account: string; name?: string; instructions?: string }

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  try {
    const s = await Setting.findOne({ key: "payment_methods" }).lean();
    if (s?.value) {
      const arr = typeof s.value === "string" ? JSON.parse(s.value) : s.value;
      if (Array.isArray(arr)) return arr;
    }
  } catch { /* fall through */ }
  return [];
}

/**
 * Live ads a seller without a plan may have at once — 1 unless the admin sets
 * otherwise. Not a monthly allowance: a slot frees up when the ad is sold,
 * deleted or expires, and a plan is the way to more.
 */
export const DEFAULT_FREE_QUOTA = 1;

export async function freeQuota(): Promise<number> {
  try {
    const s = await Setting.findOne({ key: "default_free_ad_quota" }).lean();
    const n = Number(s?.value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_FREE_QUOTA;
  } catch { return DEFAULT_FREE_QUOTA; }
}

export interface Entitlements {
  isFree: boolean;
  planName: string;
  subId: string | null;
  listingLimit: number;
  featuredLimit: number;
  featuredUsed: number;
  featuredDurationDays: number;
  endDate: Date | null;
  listingsUsed: number;
}

// Active = posted & occupying a slot (live or pending review). Sold/expired free the slot.
export async function countActiveListings(userId: string): Promise<number> {
  return Listing.countDocuments({ userId, status: { $in: ["approved", "review"] } });
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [sub, listingsUsed] = await Promise.all([getActiveSubscription(userId), countActiveListings(userId)]);
  if (sub) {
    return {
      isFree: false, planName: sub.planName, subId: sub._id.toString(),
      listingLimit: sub.listingLimit, featuredLimit: sub.featuredLimit, featuredUsed: sub.featuredUsed,
      featuredDurationDays: sub.featuredDurationDays, endDate: sub.endDate, listingsUsed,
    };
  }
  const q = await freeQuota();
  return { isFree: true, planName: "Free", subId: null, listingLimit: q, featuredLimit: 0, featuredUsed: 0, featuredDurationDays: 0, endDate: null, listingsUsed };
}

export interface PlanSnapshot { listingLimit: number; featuredLimit: number; featuredDurationDays: number; durationDays: number }

/**
 * Start a plan for a seller now: ends whatever plan they are on and creates
 * the new subscription with the plan's limits copied in. Used when an admin
 * approves a paid invoice and when an admin gives a plan directly (cash at the
 * office, a deal on the phone, a goodwill gesture — no invoice involved).
 */
export async function activatePlan(o: {
  userId: any;
  packageId: any;
  planName: string;
  snap: PlanSnapshot;
  invoiceId?: any;
  /** Overrides the plan's own duration (admin grants). */
  days?: number;
}) {
  await UserPurchasedPackage.updateMany({ userId: o.userId, status: "active" }, { $set: { status: "expired" } });
  const days = Math.max(1, Math.min(3650, Math.round(o.days || o.snap.durationDays || 30)));
  const endDate = new Date(Date.now() + days * 864e5);
  return UserPurchasedPackage.create({
    userId: o.userId, packageId: o.packageId, invoiceId: o.invoiceId ?? null, planName: o.planName,
    status: "active", startDate: new Date(), endDate,
    listingLimit: o.snap.listingLimit, featuredLimit: o.snap.featuredLimit,
    featuredDurationDays: o.snap.featuredDurationDays, featuredUsed: 0,
  });
}

/** End a seller's current plan now (they drop back to the free allowance). */
export async function endActivePlan(userId: any): Promise<number> {
  const r = await UserPurchasedPackage.updateMany({ userId, status: "active" }, { $set: { status: "expired", endDate: new Date() } });
  return r.modifiedCount;
}

/** The refusal when an ad would go over the seller's limit, or null when it fits. */
export async function listingLimitReached(userId: string): Promise<string | null> {
  const ent = await getEntitlements(userId);
  if (ent.listingsUsed < ent.listingLimit) return null;
  return ent.isFree
    ? `Free accounts can have ${ent.listingLimit} live ${ent.listingLimit === 1 ? "ad" : "ads"} at a time. Choose a plan to post more, or mark your current ad as sold.`
    : `You've used all ${ent.listingLimit} listings on your ${ent.planName} plan. Upgrade, or mark an ad as sold to free a slot.`;
}
