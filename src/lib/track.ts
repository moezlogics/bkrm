"use client";

/**
 * Lightweight, session-deduped analytics beacons.
 * - trackImpression(id): counted once per listing per browser session, batched.
 * - trackView(id): counted once per listing per session (detail page open).
 * - trackContact(id, kind): a tap on Call / WhatsApp / Live Chat, once per
 *   listing and kind per session.
 * Uses sendBeacon when available so it survives navigation.
 */
import { withBasePath } from "@/lib/base-path";

// Sets are memoized per key: without this, every card on a feed re-parsed the
// whole seen-list from sessionStorage on mount (30 cards × up to 2000 ids).
const cache: Record<string, Set<string>> = {};
const seen = (key: string): Set<string> => {
  if (typeof window === "undefined") return new Set();
  if (cache[key]) return cache[key];
  try { cache[key] = new Set(JSON.parse(sessionStorage.getItem(key) || "[]")); }
  catch { cache[key] = new Set(); }
  return cache[key];
};
// Writes are coalesced too — one serialize per burst instead of one per card.
const persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const persist = (key: string, set: Set<string>) => {
  if (persistTimers[key]) clearTimeout(persistTimers[key]);
  persistTimers[key] = setTimeout(() => {
    try { sessionStorage.setItem(key, JSON.stringify([...set].slice(-2000))); } catch { /* quota */ }
  }, 500);
};

const post = (url: string, body: any) => {
  try {
    const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;
  } catch { /* fall through */ }
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
};

let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function trackImpression(id: string) {
  if (typeof window === "undefined" || !id) return;
  const s = seen("seen_imp");
  if (s.has(id)) return;
  s.add(id); persist("seen_imp", s);
  queue.push(id);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const ids = [...new Set(queue)];
    queue = [];
    if (ids.length) post(withBasePath("/api/analytics/impression"), { ids });
  }, 700);
}

/** A tap on Call / WhatsApp / Live Chat — counted once per ad and kind per session. */
export function trackContact(id: string, kind: "call" | "whatsapp" | "chat") {
  if (typeof window === "undefined" || !id) return;
  const s = seen("seen_contact");
  const key = `${id}:${kind}`;
  if (s.has(key)) return;
  s.add(key); persist("seen_contact", s);
  post(withBasePath("/api/analytics/contact"), { id, kind });
}

export function trackView(id: string) {
  if (typeof window === "undefined" || !id) return;
  const s = seen("seen_view");
  if (s.has(id)) return;
  s.add(id); persist("seen_view", s);
  post(withBasePath("/api/analytics/view"), { id });
}
