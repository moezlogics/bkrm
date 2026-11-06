/**
 * Web Push delivery (VAPID, no third-party service): encrypts each message
 * for one browser and hands it to that browser's push service (FCM for
 * Chrome/Android, Mozilla, Apple, Microsoft).
 *
 * What keeps a big subscriber list healthy:
 *   - 404/410 = the browser dropped the subscription → marked expired;
 *   - 400/403/413 = the push service will never accept it (keys changed,
 *     corrupt keys) → marked invalid, so it isn't retried on every campaign;
 *   - 408/429/5xx = throttled or briefly down → retried with backoff,
 *     honouring Retry-After, and the subscriber is kept.
 */
import webpush from "web-push";
import { createHash } from "crypto";
import PushSubscriber from "@/models/PushSubscriber";
import { getPushBranding } from "@/lib/push/config";
import { getBaseUrl } from "@/lib/seo";

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  icon?: string | null;
  badge?: string | null;
  image?: string | null;
  tag?: string | null;
  renotify?: boolean;
  requireInteraction?: boolean;
  actions?: { title: string; url: string }[];
  /** Notification type ("message", "campaign"…) and ids, reported back by the service worker. */
  type: string;
  campaignId?: string | null;
  id: string;
};

export type SendOptions = { ttlSec?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string | null };
export type Target = { _id?: unknown; endpoint: string; keys: { p256dh: string; auth: string } };
export type Outcome = "sent" | "expired" | "invalid" | "failed";

let configured: string | null = null;

/** The public key browsers subscribe with; null when push isn't set up. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

async function ensureVapid(): Promise<boolean> {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  // The push service contacts this address about problems; it must be a
  // mailto: or https: URL.
  const brand = await getPushBranding().catch(() => null);
  const base = getBaseUrl();
  const subject = process.env.VAPID_SUBJECT
    || (brand?.contactEmail ? `mailto:${brand.contactEmail}` : base.startsWith("https://") ? base : `mailto:push@${new URL(base).hostname || "localhost"}`);
  if (configured !== subject) {
    webpush.setVapidDetails(subject, pub, priv);
    configured = subject;
  }
  return true;
}

const clip = (s: string | null | undefined, n: number) => {
  const t = String(s || "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** The JSON the service worker receives (kept well under the 4 KB push limit). */
export function payloadOf(m: PushMessage): string {
  return JSON.stringify({
    title: clip(m.title, 90),
    body: clip(m.body, 220),
    url: m.url || "/",
    icon: m.icon || undefined,
    badge: m.badge || undefined,
    image: m.image || undefined,
    tag: m.tag || undefined,
    renotify: m.renotify || undefined,
    requireInteraction: m.requireInteraction || undefined,
    actions: (m.actions || []).slice(0, 2).map((a, i) => ({ action: `a${i}`, title: clip(a.title, 24), url: a.url })),
    t: m.type,
    c: m.campaignId || undefined,
    id: m.id,
  });
}

/** Push-service collapse key: at most one pending push per topic per device. */
export const topicOf = (tag: string) => createHash("sha256").update(tag).digest("base64url").slice(0, 32);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendOne(sub: Target, payload: string, o: SendOptions = {}): Promise<{ outcome: Outcome; status?: number }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
        TTL: o.ttlSec ?? 86_400,
        urgency: o.urgency ?? "normal",
        ...(o.topic ? { topic: o.topic } : {}),
        timeout: 10_000,
      });
      return { outcome: "sent" };
    } catch (e: any) {
      const status: number | undefined = e?.statusCode;
      if (status === 404 || status === 410) return { outcome: "expired", status };
      if (status === 400 || status === 403 || status === 413) return { outcome: "invalid", status };
      if (attempt === 3) return { outcome: "failed", status };
      const retryAfter = Number(e?.headers?.["retry-after"]);
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 400 * 2 ** (attempt - 1) + Math.random() * 200);
    }
  }
  return { outcome: "failed" };
}

export type BatchResult = { sent: number; failed: number; removed: number };

/**
 * Send to many devices with limited concurrency, then record the outcomes on
 * the subscribers in one bulk write (sent counts, expired/invalid removals).
 */
export async function sendBatch(
  subs: Target[],
  message: PushMessage | ((s: Target) => PushMessage),
  o: SendOptions = {},
  concurrency = 40
): Promise<BatchResult> {
  if (!subs.length || !(await ensureVapid())) return { sent: 0, failed: subs.length, removed: 0 };
  const shared = typeof message === "function" ? null : payloadOf(message);
  const results: { s: Target; outcome: Outcome }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < subs.length) {
      const s = subs[next++];
      const { outcome } = await sendOne(s, shared ?? payloadOf((message as (s: Target) => PushMessage)(s)), o);
      results.push({ s, outcome });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, subs.length) }, worker));

  const now = new Date();
  const ops: any[] = [];
  let sent = 0, failed = 0, removed = 0;
  for (const { s, outcome } of results) {
    if (outcome === "sent") {
      sent++;
      ops.push({ updateOne: { filter: { endpoint: s.endpoint }, update: { $inc: { sentCount: 1 }, $set: { lastSentAt: now, failCount: 0 } } } });
    } else if (outcome === "expired" || outcome === "invalid") {
      removed++;
      ops.push({ updateOne: { filter: { endpoint: s.endpoint, status: "active" }, update: { $set: { status: outcome, endedAt: now } } } });
    } else {
      failed++;
      ops.push({ updateOne: { filter: { endpoint: s.endpoint }, update: { $inc: { failCount: 1 } } } });
    }
  }
  if (ops.length) await PushSubscriber.bulkWrite(ops, { ordered: false }).catch((e) => console.error("[push] outcome write failed:", e?.message));
  return { sent, failed, removed };
}
