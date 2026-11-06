/**
 * Browser side of push notifications (import from client components only).
 *
 *   enablePush(source)  — ask permission, subscribe, register the device
 *   syncPush()          — on every visit: keep the device's record current
 *                         (account, location), re-subscribe if the browser
 *                         dropped it, or if the site's keys changed
 *   disablePush()       — turn off on this device
 *   detachPushUser()    — before signing out, so the next person on this
 *                         device doesn't get this account's messages
 *   askForPush(context) — show the prompt right after a meaningful action
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const api = (p: string) => `${BASE}${p}`;
/** App-relative asset path ("/favicon.ico") -> one that works under the base path. */
export const withBase = (u: string) => (u && u.startsWith("/") && !u.startsWith("//") && !(BASE && (u === BASE || u.startsWith(`${BASE}/`))) ? `${BASE}${u}` : u);

/*
 * The site can share its domain with another push service (e.g. LaraPush on
 * example.com, whose worker sits at the domain root). Browsers give every
 * service worker its own push subscription, so both work side by side - as
 * long as we only ever touch OUR worker: scope `${BASE}/`, script `${BASE}/sw.js`.
 * `getRegistration(url)` is not safe for that: with ours not installed yet it
 * returns the other service's root worker.
 */
const SCOPE = `${BASE}/`;
const SW_URL = `${BASE}/sw.js`;

export type ClientPushConfig = {
  enabled: boolean;
  publicKey: string | null;
  siteName: string;
  icon: string;
  prompt: {
    enabled: boolean; style: "card" | "browser"; title: string; body: string; allow: string; later: string;
    delaySec: number; minPageViews: number; snoozeDays: number; excludePaths: string[];
    contexts: Record<string, { title: string; body: string }>;
  };
};

let cfgPromise: Promise<ClientPushConfig | null> | null = null;
export function getPushConfigClient(): Promise<ClientPushConfig | null> {
  cfgPromise ??= fetch(api("/api/push/config")).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cfgPromise;
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

/** "ok", "ios-install" (iPhone: only works once added to the Home Screen), or "unsupported". */
export function pushSupport(): "ok" | "ios-install" | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ok) return "ok";
  return isIOS() && !standalone() ? "ios-install" : "unsupported";
}
export function pushPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

function keyBytes(b64: string) {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

function isOwn(r: ServiceWorkerRegistration) {
  const script = (r.active || r.waiting || r.installing)?.scriptURL || "";
  return r.scope === new URL(SCOPE, location.origin).href && !!script && new URL(script).pathname === SW_URL;
}

async function ownRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  return (await navigator.serviceWorker.getRegistrations()).find(isOwn);
}

async function registration() {
  const reg = (await ownRegistration()) || (await navigator.serviceWorker.register(SW_URL, { scope: SCOPE }));
  // Wait for OUR worker to be active (subscribing needs it). Not
  // `navigator.serviceWorker.ready`: that follows the page, which on the
  // "/cars" home (no trailing slash) is outside our scope.
  if (!reg.active) {
    const w = reg.installing || reg.waiting;
    if (w) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 15_000);
        w.addEventListener("statechange", () => { if (w.state === "activated") { clearTimeout(t); resolve(); } });
      });
    }
  }
  return reg;
}

/**
 * Undo what earlier builds could do: attach OUR subscription to another
 * service's worker. Only subscriptions made with our key are removed (the
 * other service's own ones are never touched), so that service can make its
 * own again. Returns the endpoint so the server can move the record across.
 */
async function releaseMisplaced(key: Uint8Array): Promise<string | undefined> {
  let old: string | undefined;
  for (const r of await navigator.serviceWorker.getRegistrations()) {
    if (isOwn(r)) continue;
    const sub = await r.pushManager.getSubscription().catch(() => null);
    if (sub && sameKey(sub.options?.applicationServerKey, key)) {
      old = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
    }
  }
  return old;
}

async function subscription(reg: ServiceWorkerRegistration, publicKey: string) {
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Made with an older key? It can never receive our pushes — replace it.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

const SYNC_KEY = "push_sync";
async function report(sub: PushSubscription, source: string, who: string, oldEndpoint?: string) {
  const r = await fetch(api("/api/push/subscribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), source, oldEndpoint }),
  });
  if (r.ok) {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify({ endpoint: sub.endpoint, who, at: Date.now() })); } catch { /* private mode */ }
  }
  return r.ok;
}

/** Ask for permission and subscribe this device. */
export async function enablePush(source: string, who = ""): Promise<{ ok: boolean; reason?: "denied" | "unsupported" | "ios-install" | "error" }> {
  const support = pushSupport();
  if (support !== "ok") return { ok: false, reason: support };
  const cfg = await getPushConfigClient();
  if (!cfg?.enabled || !cfg.publicKey) return { ok: false, reason: "unsupported" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };
  try {
    const reg = await registration();
    const moved = await releaseMisplaced(keyBytes(cfg.publicKey));
    const sub = await subscription(reg, cfg.publicKey);
    return { ok: await report(sub, source, who, moved) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Every visit (when already allowed): refresh the device record at most twice
 * a day, or at once when the signed-in person changed on this device.
 */
export async function syncPush(who: string): Promise<void> {
  if (pushSupport() !== "ok" || Notification.permission !== "granted") return;
  const cfg = await getPushConfigClient();
  if (!cfg?.enabled || !cfg.publicKey) return;
  try {
    const reg = await registration();
    const moved = await releaseMisplaced(keyBytes(cfg.publicKey));
    const sub = await subscription(reg, cfg.publicKey);
    let last: { endpoint?: string; who?: string; at?: number } = {};
    try { last = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}"); } catch { /* ignore */ }
    const stale = !last.at || Date.now() - last.at > 12 * 3_600_000;
    if (moved || stale || last.endpoint !== sub.endpoint || (who && last.who !== who)) await report(sub, "sync", who, moved);
  } catch { /* try again next visit */ }
}

export async function currentPushEndpoint(): Promise<string | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await ownRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint || null;
}

/** Turn notifications off on this device. */
export async function disablePush(): Promise<void> {
  // Only our own worker: turning ours off must never unsubscribe another service.
  const reg = pushSupport() === "ok" ? await ownRegistration() : null;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch(api("/api/push/subscribe"), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  try { localStorage.removeItem(SYNC_KEY); } catch { /* ignore */ }
}

/** Before signing out: this device stops receiving this account's pushes. */
export async function detachPushUser(): Promise<void> {
  try {
    const endpoint = await currentPushEndpoint();
    if (!endpoint) return;
    await fetch(api("/api/push/subscribe"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint, detach: true }), keepalive: true });
    localStorage.setItem(SYNC_KEY, JSON.stringify({ endpoint, who: "", at: Date.now() }));
  } catch { /* signing out must never fail because of this */ }
}

/**
 * Offer notifications right after an action where they obviously help.
 * Also remembered for one page load, because some of those actions navigate
 * straight away (posting an ad opens the ad).
 */
export const PUSH_ASK_KEY = "push_ask_next";
export type AskContext = "post" | "save" | "chat" | "payment" | "verify" | "booking" | "inbox";
export function askForPush(context: AskContext) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(PUSH_ASK_KEY, context); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent("push:ask", { detail: context }));
}
