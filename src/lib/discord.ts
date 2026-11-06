/**
 * Discord admin notifier.
 *
 * Fire-and-forget push to the admin's Discord channel for every important
 * event (new ad, ad held for review, payment, verification, report, new
 * account, security, server error, daily report). The webhook URL comes from
 * DISCORD_WEBHOOK_URL (or Setting `discord_webhook_url`). Each kind of alert
 * can be switched off in Admin → Settings → Notifications (Setting
 * `notify_off`, a JSON list of category ids). Never throws, never blocks the
 * request that triggered it.
 *
 * Reads settings straight from the collection, not through unstable_cache:
 * alerts are also sent from background jobs, outside any request.
 */
import dbConnect from "@/lib/mongodb";
import Setting from "@/models/Setting";

export const DISCORD_COLORS = {
  listing: 0x3b82f6,   // blue
  verify: 0x8b5cf6,    // purple
  invoice: 0xf59e0b,   // amber
  approved: 0x16a34a,  // green
  report: 0xe11d2a,    // red
  account: 0x0ea5e9,   // sky
  security: 0xdc2626,  // red
  error: 0x991b1b,     // dark red
  info: 0x6b7280,      // grey
};

/** The kinds of alert, each with its own switch. */
export const NOTIFY_CATEGORIES = {
  listings: { label: "New ads", hint: "An ad was posted and went live." },
  review: { label: "Ads held for review", hint: "The spam check held an ad back — it needs your decision." },
  reports: { label: "Reports", hint: "Someone reported an ad or a seller." },
  payments: { label: "Payments", hint: "A seller paid for a plan, or a payment was approved or rejected." },
  verifications: { label: "Seller verifications", hint: "A seller uploaded their ID, and the decision on it." },
  accounts: { label: "New accounts", hint: "Someone signed up." },
  admin: { label: "Admin actions", hint: "Blocks, deletions, plans given and admin rights changed — by any admin." },
  security: { label: "Security", hint: "Admin sign-ins and sign-ins paused after wrong passwords." },
  errors: { label: "Server errors", hint: "A page or request failed on the server (each error at most every 30 minutes)." },
  digest: { label: "Daily report", hint: "Every morning at 9:00: the last 24 hours and what is waiting for you." },
} as const;
export type NotifyCategory = keyof typeof NOTIFY_CATEGORIES;

export interface DiscordPayload {
  title: string;
  description?: string;
  url?: string;              // clickable link (relative → prefixed with app URL)
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  /** Which switch this alert obeys. Without one it is always sent. */
  category?: NotifyCategory;
}

type Conf = { at: number; webhook: string; off: Set<string>; site: string };
const g = globalThis as unknown as { __discordConf?: Conf | null };
const CONF_TTL = 30_000;

async function conf(): Promise<Conf> {
  const c = g.__discordConf;
  if (c && Date.now() - c.at < CONF_TTL) return c;
  let byKey = new Map<string, unknown>();
  try {
    await dbConnect();
    const docs: any[] = await Setting.find({ key: { $in: ["discord_webhook_url", "notify_off", "site_name"] } }).lean();
    byKey = new Map(docs.map((d) => [d.key, d.value]));
  } catch { /* defaults */ }
  let off: string[] = [];
  try {
    const raw = byKey.get("notify_off");
    off = Array.isArray(raw) ? raw : JSON.parse(String(raw || "[]"));
  } catch { /* none off */ }
  const saved = String(byKey.get("discord_webhook_url") || "");
  // Secure source: env. The DB setting is an optional fallback (no secret in code).
  const webhook = process.env.DISCORD_WEBHOOK_URL?.startsWith("http") ? process.env.DISCORD_WEBHOOK_URL : saved.startsWith("http") ? saved : "";
  const site = String(byKey.get("site_name") || process.env.NEXT_PUBLIC_APP_NAME || "Marketplace");
  const next: Conf = { at: Date.now(), webhook, off: new Set(off.map(String)), site };
  g.__discordConf = next;
  return next;
}

/** Forget the cached settings (after Settings → Notifications is saved). */
export function resetDiscordConfig() {
  g.__discordConf = null;
}

/** Whether alerts can go anywhere at all. */
export async function discordConfigured(): Promise<boolean> {
  return !!(await conf()).webhook;
}

export async function notifyDiscord(payload: DiscordPayload): Promise<void> {
  try {
    const c = await conf();
    if (!c.webhook) return;
    if (payload.category && c.off.has(payload.category)) return;
    const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const url = payload.url ? (payload.url.startsWith("http") ? payload.url : `${base}${payload.url}`) : undefined;

    const embed: any = {
      title: payload.title.slice(0, 250),
      description: payload.description?.slice(0, 3500),
      url,
      color: payload.color ?? DISCORD_COLORS.info,
      fields: payload.fields?.slice(0, 20).map((f) => ({ name: f.name.slice(0, 250), value: (f.value || "—").slice(0, 1000), inline: f.inline })),
      footer: { text: c.site },
      timestamp: new Date().toISOString(),
    };

    await fetch(c.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `${c.site} Admin`.slice(0, 80), embeds: [embed] }),
      signal: AbortSignal.timeout(6000),
    });
  } catch (e: any) {
    console.warn("[discord] notify failed:", e?.message || e);
  }
}

/**
 * Send an alert at most once per `minutes` for the same `key` (across every
 * app process): a broken page hit a thousand times is one alert.
 */
export async function notifyDiscordOnce(key: string, minutes: number, payload: DiscordPayload): Promise<void> {
  try {
    const { once } = await import("@/lib/push/once");
    if (!(await once(`discord:${key}`.slice(0, 900), minutes / 60))) return;
  } catch { /* if the guard fails, still send */ }
  await notifyDiscord(payload);
}
