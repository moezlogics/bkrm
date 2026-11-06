/**
 * Push notification settings — all editable in Admin → Push notifications.
 *
 * Nothing about the brand is fixed here: the site name, icons, prompt wording
 * and every automatic message's title/body come from the database, with the
 * defaults below only as a starting point. Templates use {placeholders}
 * ({site} is always available).
 *
 * Read straight from the Setting collection (not unstable_cache): pushes are
 * also sent from background jobs, outside any request.
 */
import dbConnect from "@/lib/mongodb";
import Setting from "@/models/Setting";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";

export const PUSH_CONFIG_KEY = "push_config";

/** Groups a person can switch off in their account. */
export const PUSH_CATEGORIES: Record<string, { label: string; hint: string }> = {
  messages: { label: "Messages & offers", hint: "When someone messages you, or makes or answers an offer" },
  ...(BOOKINGS_ON ? { bookings: { label: "Bookings", hint: "New bookings, confirmations, cancellations and reminders" } } : {}),
  my_ads: { label: "My ads", hint: "Approvals, views, saves, reviews, boost offers and expiry" },
  saved: { label: "Saved ads", hint: "Price drops and sold ads you saved" },
  account: { label: "Plan & account", hint: "Your plan and payments, verification and account updates" },
  promotions: { label: "News & offers", hint: "Announcements and deals" },
};

/**
 * Types that only buzz the phone. Everything else is also kept in the
 * person's notification list (the bell) — chat has its own unread count.
 */
export const NOT_IN_INBOX = new Set(["message", "welcome"]);

type AutoDef = {
  category: keyof typeof PUSH_CATEGORIES;
  label: string;
  /** Who receives it — shown in the admin list. */
  to: string;
  /**
   * Default for "send straight away": ignores quiet hours and the daily limit
   * (things people are waiting on). Admins can change it per notification.
   */
  immediate: boolean;
  vars: string[];
  title: string;
  body: string;
};

export const AUTO_TYPES: Record<string, AutoDef> = {
  message: {
    category: "messages", label: "New chat message", to: "Buyers & sellers", immediate: true,
    vars: ["sender", "message", "listing", "count"],
    title: "{sender}", body: "{message}",
  },
  offer_received: {
    category: "messages", label: "New offer on an ad", to: "Sellers", immediate: true,
    vars: ["sender", "amount", "listing"],
    title: "New offer: {amount}", body: "{sender} offered {amount} for {listing}",
  },
  offer_accepted: {
    category: "messages", label: "Offer accepted", to: "Buyers", immediate: true,
    vars: ["amount", "listing"],
    title: "Offer accepted", body: "The seller accepted your {amount} offer for {listing}. Arrange the deal in chat.",
  },
  offer_rejected: {
    category: "messages", label: "Offer declined", to: "Buyers", immediate: true,
    vars: ["amount", "listing"],
    title: "Offer declined", body: "Your {amount} offer for {listing} was declined. You can make a new offer in chat.",
  },
  listing_approved: {
    category: "my_ads", label: "Ad approved", to: "Sellers", immediate: true,
    vars: ["listing"],
    title: "Your ad is live", body: "{listing} is now visible to buyers.",
  },
  listing_rejected: {
    category: "my_ads", label: "Ad not approved", to: "Sellers", immediate: true,
    vars: ["listing", "reason"],
    title: "Your ad needs changes", body: "{listing} wasn't approved. {reason}",
  },
  views_milestone: {
    category: "my_ads", label: "Views milestone", to: "Sellers", immediate: false,
    vars: ["count", "listing"],
    title: "{count} people viewed your ad", body: "{listing} is getting attention. Keep your phone close for messages.",
  },
  favourite: {
    category: "my_ads", label: "Ad saved by a buyer", to: "Sellers", immediate: false,
    vars: ["listing", "count"],
    title: "A buyer saved your ad", body: "{listing} was added to someone's favourites.",
  },
  review_received: {
    category: "my_ads", label: "New review", to: "Sellers", immediate: true,
    vars: ["rating", "reviewer", "review"],
    title: "New {rating}★ review", body: "{reviewer}: {review}",
  },
  boost_ending: {
    category: "my_ads", label: "Boost ending soon", to: "Sellers", immediate: true,
    vars: ["listing", "when"],
    title: "Your boost ends soon", body: "{listing} leaves the top spots {when}. Renew to keep getting seen.",
  },
  ad_expiring: {
    category: "my_ads", label: "Ad expiring soon", to: "Sellers", immediate: false,
    vars: ["listing", "when"],
    title: "Your ad expires {when}", body: "Renew {listing} from your dashboard to keep it in front of buyers.",
  },
  ad_expired: {
    category: "my_ads", label: "Ad expired", to: "Sellers", immediate: false,
    vars: ["listing"],
    title: "Your ad has expired", body: "{listing} is no longer shown to buyers. Renew it in one tap from your dashboard.",
  },
  boost_offer: {
    category: "my_ads", label: "Boost offer (free sellers, a day after posting)", to: "Sellers on the free plan", immediate: false,
    vars: ["listing", "views", "price"],
    title: "Reach 3x more buyers", body: "{views} people have seen {listing}. Feature it at the top of {site} so many more do — plans from {price}.",
  },
  boost_unused: {
    category: "my_ads", label: "Unused boosts reminder", to: "Sellers with boosts left on their plan", immediate: false,
    vars: ["listing", "left"],
    title: "You have {left} left on your plan", body: "Feature {listing} at the top of {site} — it takes one tap.",
  },
  reply_reminder: {
    category: "messages", label: "Unanswered message reminder", to: "Buyers & sellers", immediate: false,
    vars: ["sender", "listing"],
    title: "{sender} is waiting for your reply", body: "About {listing}. People who reply quickly close more deals.",
  },
  price_drop: {
    category: "saved", label: "Price drop on a saved ad", to: "Buyers who saved it", immediate: false,
    vars: ["listing", "price", "oldPrice"],
    title: "Price drop: {listing}", body: "Now {price} (was {oldPrice}). Grab it before someone else does.",
  },
  saved_sold: {
    category: "saved", label: "Saved ad sold", to: "Buyers who saved it", immediate: false,
    vars: ["listing", "category"],
    title: "An ad you saved was sold", body: "{listing} is no longer available. Tap to see similar {category}.",
  },
  plan_activated: {
    category: "account", label: "Plan activated", to: "Sellers", immediate: true,
    vars: ["plan", "listings", "boosts", "date"],
    title: "Your {plan} plan is active", body: "You can now have {listings} live ads and {boosts}, until {date}.",
  },
  payment_rejected: {
    category: "account", label: "Payment not verified", to: "Sellers", immediate: true,
    vars: ["plan", "reason"],
    title: "We couldn't verify your payment", body: "{plan} plan: {reason} Tap to send it again.",
  },
  plan_expiring: {
    category: "account", label: "Plan ending soon", to: "Sellers", immediate: false,
    vars: ["plan", "when"],
    title: "Your {plan} plan ends {when}", body: "Renew it to keep posting more ads and featuring them.",
  },
  plan_expired: {
    category: "account", label: "Plan ended", to: "Sellers", immediate: false,
    vars: ["plan", "free"],
    title: "Your {plan} plan has ended", body: "You're back on the free plan ({free}). Renew to post more ads and feature them.",
  },
  payment_submitted: {
    category: "account", label: "New payment to verify (admins)", to: "Admins", immediate: true,
    vars: ["name", "amount", "plan"],
    title: "New payment to verify", body: "{name} paid {amount} for the {plan} plan — tap to check it.",
  },
  ...(BOOKINGS_ON ? {
    booking_request: {
      category: "bookings", label: "New booking request", to: "Service providers & organisers", immediate: true,
      vars: ["customer", "what", "when", "listing"],
      title: "New booking: {what}", body: "{customer} wants {listing} on {when}. Tap to confirm or decline.",
    },
    booking_confirmed: {
      category: "bookings", label: "Booking confirmed", to: "Customers", immediate: true,
      vars: ["provider", "what", "when", "code"],
      title: "Booking confirmed ✓", body: "{provider} confirmed {what} on {when}. Booking {code}.",
    },
    booking_declined: {
      category: "bookings", label: "Booking declined", to: "Customers", immediate: true,
      vars: ["provider", "what", "reason"],
      title: "Booking not accepted", body: "{provider} couldn't take {what}. {reason} Tap to book someone else.",
    },
    booking_cancelled: {
      category: "bookings", label: "Booking cancelled", to: "The other side", immediate: true,
      vars: ["by", "what", "when", "reason"],
      title: "Booking cancelled", body: "{by} cancelled {what} on {when}. {reason}",
    },
    booking_reminder: {
      category: "bookings", label: "Booking reminder (the day before)", to: "Customers & providers", immediate: true,
      vars: ["what", "when", "other"],
      title: "Tomorrow: {what}", body: "{when} with {other}. Keep your phone close.",
    },
  } satisfies Record<string, AutoDef> : {}),
  verification_approved: {
    category: "account", label: "Verification approved", to: "Users", immediate: true,
    vars: [],
    title: "You're verified", body: "Your {site} account now shows the verified badge.",
  },
  verification_rejected: {
    category: "account", label: "Verification not approved", to: "Users", immediate: true,
    vars: ["reason"],
    title: "Verification needs attention", body: "We couldn't verify your documents. {reason}",
  },
  verification_submitted: {
    category: "account", label: "New seller verification (admins)", to: "Admins", immediate: true,
    vars: ["name"],
    title: "New verification request", body: "{name} uploaded their CNIC — tap to review.",
  },
  welcome: {
    category: "account", label: "Welcome (right after allowing)", to: "New subscribers", immediate: true,
    vars: [],
    title: "Notifications are on", body: "{site} will let you know about messages, offers and price drops.",
  },
};

export type PromptCopy = { title: string; body: string };
/** Moments that ask for notifications with their own wording (askForPush). */
export type PushContext = "post" | "save" | "chat" | "payment" | "verify" | "booking" | "inbox";
export type PushConfig = {
  enabled: boolean;
  /** Notification icon; empty = the site favicon/logo. */
  icon: string;
  /** Small monochrome status-bar icon (Android). */
  badge: string;
  timezone: string;
  prompt: {
    enabled: boolean;
    /**
     * "card": our card first, the browser's own prompt only after "Allow"
     * (a "Not now" doesn't count against the domain in Chrome — important when
     * the domain is shared with another push service).
     * "browser": the browser's prompt straight away where it allows that
     * (Chrome, Edge, Android); Firefox and Safari still get the card.
     */
    style: "card" | "browser";
    title: string;
    body: string;
    allow: string;
    later: string;
    delaySec: number;
    minPageViews: number;
    snoozeDays: number;
    /** Comma-separated path prefixes where the prompt never appears. */
    excludePaths: string;
    /** Copy used when the ask follows an action (posting, saving, chatting). */
    contexts: Record<PushContext, PromptCopy>;
  };
  quiet: { enabled: boolean; start: string; end: string };
  /** Max pushes per person per day, for notifications that aren't sent straight away. */
  dailyCap: number;
  milestones: string;
  priceDropMinPct: number;
  auto: Record<string, { enabled: boolean; immediate: boolean; title: string; body: string }>;
};

export const DEFAULT_PUSH_CONFIG: PushConfig = {
  enabled: true,
  icon: "",
  badge: "",
  timezone: "Asia/Karachi",
  prompt: {
    enabled: true,
    style: "card",
    title: "Don't miss a buyer or a deal",
    body: "Get notified about new messages, offers and price drops on {site}.",
    allow: "Allow",
    later: "Not now",
    delaySec: 6,
    minPageViews: 1,
    snoozeDays: 7,
    excludePaths: "/admin,/login,/signup,/newlogin,/forgot-password",
    contexts: {
      post: { title: "Know the moment a buyer messages you", body: "Turn on notifications so you never miss an offer on your ad." },
      save: { title: "Get price-drop alerts", body: "We'll tell you when an ad you saved gets cheaper." },
      chat: { title: "Get replies instantly", body: "Turn on notifications to see the seller's reply as soon as it arrives." },
      payment: { title: "Know the moment your plan is active", body: "Turn on notifications and we'll tell you as soon as your payment is checked." },
      verify: { title: "Get told when you're verified", body: "Turn on notifications to hear the moment our team checks your CNIC." },
      booking: { title: "Don't miss a booking update", body: "Turn on notifications for new bookings, confirmations and the reminder the day before." },
      inbox: { title: "Get these on your phone", body: "Turn on notifications so messages, offers and updates reach you even when {site} is closed." },
    },
  },
  quiet: { enabled: true, start: "23:00", end: "08:00" },
  dailyCap: 6,
  milestones: "10,50,100,250,500,1000",
  priceDropMinPct: 3,
  auto: Object.fromEntries(Object.entries(AUTO_TYPES).map(([k, d]) => [k, { enabled: true, immediate: d.immediate, title: d.title, body: d.body }])),
};

/** Deep-merge saved settings over the defaults (new types get their defaults). */
function merge(saved: any): PushConfig {
  const d = DEFAULT_PUSH_CONFIG;
  const s = saved && typeof saved === "object" ? saved : {};
  const auto: PushConfig["auto"] = {};
  for (const k of Object.keys(AUTO_TYPES)) auto[k] = { ...d.auto[k], ...(s.auto?.[k] || {}) };
  return {
    ...d, ...s,
    prompt: { ...d.prompt, ...(s.prompt || {}), contexts: { ...d.prompt.contexts, ...(s.prompt?.contexts || {}) } },
    quiet: { ...d.quiet, ...(s.quiet || {}) },
    auto,
  };
}

export type PushBranding = { siteName: string; icon: string; badge: string; contactEmail: string; currency: string };

// Process-wide (route bundles and background jobs share it), so an admin save
// takes effect everywhere at once.
type Cache = { at: number; cfg: PushConfig; brand: PushBranding };
const g = globalThis as unknown as { __pushCfg?: { c: Cache | null } };
const holder = (g.__pushCfg ??= { c: null });
// How long a process keeps settings before re-reading them (tests lower it).
const TTL = Number(process.env.PUSH_CONFIG_TTL_MS || 30_000);

async function load() {
  const cached = holder.c;
  if (cached && Date.now() - cached.at < TTL) return cached;
  await dbConnect();
  const docs: any[] = await Setting.find({ key: { $in: [PUSH_CONFIG_KEY, "site_name", "site_favicon", "site_logo", "contact_email", "currency_symbol"] } }).lean();
  const byKey = new Map(docs.map((d) => [d.key, d.value as string]));
  let saved: any = null;
  try { saved = JSON.parse(byKey.get(PUSH_CONFIG_KEY) || "null"); } catch { /* keep defaults */ }
  const cfg = merge(saved);
  const brand: PushBranding = {
    siteName: byKey.get("site_name") || process.env.NEXT_PUBLIC_APP_NAME || "Classifieds",
    // Same as the browser tab: push settings icon → admin favicon → logo → /brand-icon.
    icon: cfg.icon || byKey.get("site_favicon") || byKey.get("site_logo") || "/brand-icon",
    badge: cfg.badge || "",
    contactEmail: byKey.get("contact_email") || "",
    currency: byKey.get("currency_symbol") || "Rs",
  };
  holder.c = { at: Date.now(), cfg, brand };
  return holder.c;
}

export async function getPushConfig(): Promise<PushConfig> {
  return (await load()).cfg;
}
export async function getPushBranding(): Promise<PushBranding> {
  return (await load()).brand;
}

/** Save from the admin panel. */
export async function savePushConfig(next: unknown): Promise<PushConfig> {
  const cfg = merge(next);
  await dbConnect();
  await Setting.updateOne({ key: PUSH_CONFIG_KEY }, { $set: { value: JSON.stringify(cfg), type: "string" } }, { upsert: true });
  holder.c = null;
  return cfg;
}

/** "{sender} offered {amount}" + vars → text. {site} is always filled in. */
export function renderTemplate(tpl: string, vars: Record<string, unknown>, siteName: string): string {
  return String(tpl || "")
    .replace(/\{(\w+)\}/g, (_, k: string) => (k === "site" ? siteName : vars[k] == null ? "" : String(vars[k])))
    .replace(/\s+/g, " ")
    .trim();
}

// ── time helpers (Pakistan time by default, configurable) ──
const fmts = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string, d: Date) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    fmts.set(tz, f);
  }
  const o = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { day: `${o.year}-${o.month}-${o.day}`, minutes: (Number(o.hour) % 24) * 60 + Number(o.minute) };
}
export function dayKey(tz: string, d = new Date()) {
  try { return parts(tz, d).day; } catch { return d.toISOString().slice(0, 10); }
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** If now is inside quiet hours, when they end; otherwise null. */
export function quietUntil(cfg: PushConfig, now = new Date()): Date | null {
  if (!cfg.quiet.enabled) return null;
  let minutes: number;
  try { minutes = parts(cfg.timezone, now).minutes; } catch { return null; }
  const start = toMin(cfg.quiet.start), end = toMin(cfg.quiet.end);
  const inside = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  if (!inside) return null;
  const wait = (end - minutes + 1440) % 1440;
  return new Date(now.getTime() + wait * 60_000);
}

/** The configured timezone without a DB read (defaults until settings load). */
export function currentTimezone(): string {
  return holder.c?.cfg.timezone || DEFAULT_PUSH_CONFIG.timezone;
}
