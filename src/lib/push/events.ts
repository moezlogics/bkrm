/**
 * What happens on the site → which automatic push goes to whom.
 *
 * Every function here is fire-and-forget: it returns immediately and never
 * throws, so a push problem can't slow down or break sending a message,
 * posting an offer or saving an ad.
 */
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Listing from "@/models/Listing";
import Favourite from "@/models/Favourite";
import ChatMessage from "@/models/ChatMessage";
import { pushToUsers, type AutoPush } from "@/lib/push/notify";
import { getPushConfig, getPushBranding, dayKey } from "@/lib/push/config";
import { once } from "@/lib/push/once";
import { isCdnImage, cdnLoader } from "@/lib/cdn-image";

const safe = (label: string, fn: () => Promise<unknown>) => {
  fn().catch((e) => console.error(`[push] ${label}:`, e?.message));
};
const thumb = (src?: string | null, width = 256) =>
  !src ? null : isCdnImage(src) ? cdnLoader({ src, width, quality: 75 }) : src;
const money = (n: unknown, symbol: string) => {
  const v = Number(n);
  return Number.isFinite(v) ? `${symbol} ${Math.round(v).toLocaleString("en-US")}` : "";
};
const nameOf = async (userId: unknown) =>
  ((await User.findById(userId).select("name").lean()) as any)?.name || "Someone";

// Rapid messages in one chat replace each other quietly; the phone only
// buzzes again after a pause (like messaging apps).
const lastBuzz = new Map<string, number>();
const BUZZ_GAP_MS = 45_000;
function shouldBuzz(tag: string) {
  const now = Date.now(), prev = lastBuzz.get(tag) || 0;
  lastBuzz.set(tag, now);
  if (lastBuzz.size > 20_000) lastBuzz.delete(lastBuzz.keys().next().value as string);
  return now - prev > BUZZ_GAP_MS;
}

/** A chat message (or an offer made in chat) → the other person. */
export function onChatMessage(o: {
  listing: { _id: unknown; name: string; userId: unknown; mainImage?: string | null; galleryImages?: string[] };
  senderId: string; receiverId: string; text: string; offerAmount?: number | null;
}) {
  safe("chat", async () => {
    await dbConnect();
    const [sender, brand] = await Promise.all([nameOf(o.senderId), getPushBranding()]);
    const adId = String(o.listing._id);
    // Thread ids are "<ad>_<other person>" from the viewer's side.
    const url = `/chat?threadId=${adId}_${o.senderId}`;
    const tag = `chat:${adId}:${o.senderId}`;
    const icon = thumb(o.listing.mainImage || o.listing.galleryImages?.[0], 160);
    let p: AutoPush;
    if (o.offerAmount) {
      p = { type: "offer_received", vars: { sender, amount: money(o.offerAmount, brand.currency), listing: o.listing.name }, url, tag, renotify: true, icon };
    } else {
      const unread = await ChatMessage.countDocuments({ itemId: adId, senderId: o.senderId, receiverId: o.receiverId, isRead: false });
      p = {
        type: "message",
        vars: { sender, message: unread > 1 ? `${o.text} (+${unread - 1} more)` : o.text, listing: o.listing.name, count: unread || 1 },
        url, tag, renotify: shouldBuzz(tag), icon,
      };
    }
    await pushToUsers([o.receiverId], p);
  });
}

/** Seller accepted / declined an offer → the buyer. */
export function onOfferDecision(o: { buyerId: unknown; sellerId: unknown; itemId: unknown; amount: number; accepted: boolean }) {
  safe("offer", async () => {
    await dbConnect();
    const [listing, brand] = await Promise.all([
      Listing.findById(o.itemId).select("name mainImage galleryImages").lean() as Promise<any>,
      getPushBranding(),
    ]);
    await pushToUsers([o.buyerId], {
      type: o.accepted ? "offer_accepted" : "offer_rejected",
      vars: { amount: money(o.amount, brand.currency), listing: listing?.name || "the ad" },
      url: `/chat?threadId=${o.itemId}_${o.sellerId}`,
      tag: `chat:${o.itemId}:${o.sellerId}`,
      renotify: true,
      icon: thumb(listing?.mainImage || listing?.galleryImages?.[0], 160),
    });
  });
}

/** Someone saved an ad → its seller (at most once per ad every 6 hours). */
export function onFavourite(o: { listingId: unknown; byUserId: string }) {
  safe("favourite", async () => {
    await dbConnect();
    const l: any = await Listing.findById(o.listingId).select("name slug userId mainImage galleryImages").lean();
    if (!l || String(l.userId) === o.byUserId) return;
    if (!(await once(`fav:${l._id}`, 6))) return;
    const count = await Favourite.countDocuments({ itemId: l._id });
    await pushToUsers([l.userId], {
      type: "favourite", vars: { listing: l.name, count }, url: `/ads/${l.slug}`,
      tag: `fav:${l._id}`, icon: thumb(l.mainImage || l.galleryImages?.[0], 160),
    });
  });
}

/** A buyer reviewed a seller → the seller. */
export function onReview(o: { sellerId: string; reviewerId?: string | null; reviewerName?: string; rating: number; comment?: string | null }) {
  safe("review", async () => {
    await dbConnect();
    // Guests review under the name they typed.
    const reviewer = o.reviewerId ? await nameOf(o.reviewerId) : `${o.reviewerName || "A visitor"} (guest)`;
    await pushToUsers([o.sellerId], {
      type: "review_received",
      vars: { rating: o.rating, reviewer, review: o.comment || "left you a rating" },
      url: "/dashboard/seller",
    });
  });
}

/** A seller uploaded their CNIC → every admin. */
export function onVerificationRequest(o: { name: string }) {
  safe("verification-request", async () => {
    await dbConnect();
    const admins = await User.find({ role: "admin", isBlocked: { $ne: true } }).select("_id").lean();
    await pushToUsers(admins.map((a: any) => a._id), {
      type: "verification_submitted",
      vars: { name: o.name },
      url: "/admin/verifications",
    });
  });
}

/** Admin decided an ID verification → the person. */
export function onVerification(o: { userId: unknown; approved: boolean; reason?: string | null }) {
  safe("verification", () => pushToUsers([o.userId], {
    type: o.approved ? "verification_approved" : "verification_rejected",
    vars: { reason: o.reason || "" },
    url: o.approved ? "/dashboard" : "/dashboard/verify",
  }));
}

/**
 * A listing was saved (Listing model hook): moderation outcomes → the seller,
 * a real price drop → everyone who saved the ad.
 */
export function onListingSaved(doc: any, was: { status?: string; price?: unknown }) {
  safe("listing", async () => {
    const now = doc.status;
    const image = doc.mainImage || doc.galleryImages?.[0];
    if (was.status === "review" && now === "approved") {
      await pushToUsers([doc.userId], { type: "listing_approved", vars: { listing: doc.name }, url: `/ads/${doc.slug}`, tag: `ad:${doc._id}`, icon: thumb(image, 160) });
    } else if (was.status && was.status !== "rejected" && now === "rejected") {
      const reason = (doc.flagReasons || []).length ? `Reason: ${doc.flagReasons.slice(0, 2).join(", ")}.` : "Open your ads to see what to change.";
      await pushToUsers([doc.userId], { type: "listing_rejected", vars: { listing: doc.name, reason }, url: "/dashboard/seller", tag: `ad:${doc._id}` });
    }

    // Sold → the people who saved it stop waiting (once per ad).
    if (was.status && was.status !== "sold out" && now === "sold out" && (await once(`sold:${doc._id}`, 24 * 90))) {
      await dbConnect();
      const savers = (await Favourite.distinct("userId", { itemId: doc._id })).filter((u) => String(u) !== String(doc.userId));
      if (savers.length) {
        await pushToUsers(savers, { type: "saved_sold", vars: { listing: doc.name }, url: `/ads/${doc.slug}`, tag: `sold:${doc._id}`, icon: thumb(image, 160) });
      }
    }

    const before = Number(was.price), after = Number(doc.price);
    if (now === "approved" && Number.isFinite(before) && Number.isFinite(after) && before > 0 && after < before) {
      const cfg = await getPushConfig();
      if ((before - after) / before * 100 < cfg.priceDropMinPct) return;
      if (!(await once(`drop:${doc._id}:${dayKey(cfg.timezone)}`, 24))) return;
      await dbConnect();
      const savers = (await Favourite.distinct("userId", { itemId: doc._id })).filter((u) => String(u) !== String(doc.userId));
      if (!savers.length) return;
      const brand = await getPushBranding();
      await pushToUsers(savers, {
        type: "price_drop",
        vars: { listing: doc.name, price: money(after, brand.currency), oldPrice: money(before, brand.currency) },
        url: `/ads/${doc.slug}`, tag: `drop:${doc._id}`, image: thumb(image, 640), icon: thumb(image, 160),
      });
    }
  });
}

/** Views were counted (lib/counters): tell sellers when an ad crosses a milestone. */
export function onViewsCounted(rows: { _id: unknown; name: string; slug: string; userId: unknown; clicks: number; added: number }[]) {
  safe("views", async () => {
    const cfg = await getPushConfig();
    if (!cfg.auto.views_milestone?.enabled) return;
    const marks = cfg.milestones.split(",").map((s) => parseInt(s, 10)).filter((n) => n > 0).sort((a, b) => a - b);
    for (const r of rows) {
      const crossed = marks.filter((m) => r.clicks - r.added < m && r.clicks >= m).pop();
      if (!crossed || !(await once(`views:${r._id}:${crossed}`, 24 * 365))) continue;
      await pushToUsers([r.userId], { type: "views_milestone", vars: { count: crossed.toLocaleString("en-US"), listing: r.name }, url: `/ads/${r.slug}`, tag: `views:${r._id}` });
    }
  });
}

/** Scheduler: boosts ending within a day → their sellers (once per boost). */
export async function remindEndingBoosts() {
  await dbConnect();
  const now = Date.now();
  const ending: any[] = await Listing.find({
    status: "approved", isFeatured: true,
    featuredExpiresAt: { $gt: new Date(now + 2 * 3_600_000), $lte: new Date(now + 24 * 3_600_000) },
  }).select("name slug userId featuredExpiresAt").limit(500).lean();
  for (const l of ending) {
    if (!(await once(`boost:${l._id}:${new Date(l.featuredExpiresAt).getTime()}`, 72))) continue;
    const hours = Math.round((new Date(l.featuredExpiresAt).getTime() - now) / 3_600_000);
    await pushToUsers([l.userId], { type: "boost_ending", vars: { listing: l.name, when: hours <= 12 ? `in ${hours} hours` : "tomorrow" }, url: "/dashboard/seller", tag: `boost:${l._id}` });
  }
}

const dateText = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Admin decided a plan payment → the seller (and a plan given by an admin). */
export function onPlanDecision(o: {
  userId: unknown; approved: boolean; planName: string; reason?: string | null;
  sub?: { listingLimit: number; featuredLimit: number; endDate: Date } | null;
}) {
  safe("plan", async () => {
    if (o.approved && o.sub) {
      await pushToUsers([o.userId], {
        type: "plan_activated",
        vars: {
          plan: o.planName,
          listings: o.sub.listingLimit,
          boosts: o.sub.featuredLimit ? plural(o.sub.featuredLimit, "featured ad") : "no featured ads",
          date: dateText(o.sub.endDate),
        },
        url: "/dashboard/seller", tag: "plan",
      });
    } else if (!o.approved) {
      const reason = (o.reason || "The screenshot didn't match a payment we received.").trim();
      await pushToUsers([o.userId], {
        type: "payment_rejected",
        vars: { plan: o.planName, reason: /[.!?]$/.test(reason) ? reason : `${reason}.` },
        url: "/dashboard/plans", tag: "plan",
      });
    }
  });
}

/** A seller sent payment proof → every admin. */
export function onPaymentSubmitted(o: { name: string; amount: number; planName: string }) {
  safe("payment-submitted", async () => {
    await dbConnect();
    const [admins, brand] = await Promise.all([
      User.find({ role: "admin", isBlocked: { $ne: true } }).select("_id").lean(),
      getPushBranding(),
    ]);
    await pushToUsers(admins.map((a: any) => a._id), {
      type: "payment_submitted",
      vars: { name: o.name, amount: money(o.amount, brand.currency), plan: o.planName },
      url: "/admin/invoices",
    });
  });
}

// The Listing model can't import this module (it would import the model back),
// so it reports saves through this process-wide hook.
(globalThis as any).__listingPush = onListingSaved;
