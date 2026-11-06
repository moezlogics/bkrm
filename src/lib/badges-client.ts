"use client";

/**
 * The unread counts on the bell and the Chat tab, shared by every component
 * that shows them: one request for the whole page, refreshed every minute
 * while the tab is visible, when it comes back into view, and right after
 * something changes them (refreshBadges()).
 */
import { useEffect, useState } from "react";

export type Badges = { notifications: number; chats: number };
const EMPTY: Badges = { notifications: 0, chats: 0 };
const EVENT = "badges:refresh";

const g = globalThis as unknown as { __badges?: { value: Badges; at: number; inflight: Promise<void> | null; subs: Set<(b: Badges) => void> } };
const store = (g.__badges ??= { value: EMPTY, at: 0, inflight: null, subs: new Set() });

async function load(force = false) {
  if (!force && Date.now() - store.at < 20_000) return;
  if (store.inflight) return store.inflight;
  store.inflight = fetch("/api/me/badges", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : EMPTY))
    .then((b: Badges) => {
      store.value = { notifications: Number(b.notifications) || 0, chats: Number(b.chats) || 0 };
      store.at = Date.now();
      store.subs.forEach((f) => f(store.value));
    })
    .catch(() => {})
    .finally(() => { store.inflight = null; });
  return store.inflight;
}

/** Re-read the counts now (after reading notifications or a chat). */
export function refreshBadges() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** Set the bell count straight away (e.g. after "mark all read"). */
export function setNotificationBadge(n: number) {
  store.value = { ...store.value, notifications: Math.max(0, n) };
  store.subs.forEach((f) => f(store.value));
}

export function useBadges(enabled: boolean): Badges {
  const [b, setB] = useState<Badges>(store.value);
  useEffect(() => {
    if (!enabled) return;
    store.subs.add(setB);
    void load();
    const tick = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    const onEvent = () => void load(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(EVENT, onEvent);
    return () => {
      store.subs.delete(setB);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(EVENT, onEvent);
    };
  }, [enabled]);
  return enabled ? b : EMPTY;
}
