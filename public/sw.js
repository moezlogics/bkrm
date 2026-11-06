/* eslint-disable no-restricted-globals */
/**
 * Push service worker. Push only: no fetch handler, so pages are never served
 * from a stale cache.
 *
 * Payload (lib/push/send.ts → payloadOf):
 *   { title, body, url, icon, badge, image, tag, renotify, requireInteraction,
 *     actions: [{ action, title, url }], t: type, c: campaignId, id }
 *
 * Every URL is resolved against this worker's scope, so the site also works
 * under a base path (e.g. mymobile.pk/marketplace). A path that already
 * includes the base path ("/marketplace/lahore") or a full URL is kept as is.
 *
 * The domain may also run another push service (LaraPush at the root): its
 * worker has its own subscription and never sees these messages, and this
 * worker only ever focuses windows that belong to this site.
 */
const SCOPE = new URL(self.registration.scope);
const BASE = SCOPE.pathname.replace(/\/$/, ""); // "" or "/marketplace"
const scoped = (path) => {
  const p = String(path || "/");
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith("//")) return new URL(p, SCOPE).href;
  if (BASE && (p === BASE || p.startsWith(`${BASE}/`) || p.startsWith(`${BASE}?`))) return new URL(p, SCOPE.origin).href;
  return new URL(p.replace(/^\//, ""), SCOPE).href;
};
// Our pages: the base path itself ("/marketplace") and everything under it.
const ours = (url) => {
  try {
    const u = new URL(url);
    return u.origin === SCOPE.origin && (!BASE || u.pathname === BASE || u.pathname.startsWith(`${BASE}/`));
  } catch { return false; }
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function track(e, data) {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    await fetch(scoped("/api/push/track"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ e, id: data.id, t: data.t, c: data.c, endpoint: sub ? sub.endpoint : undefined }),
      keepalive: true,
    });
  } catch (err) { /* best effort */ }
}

self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (err) { p = { title: event.data ? event.data.text() : "" }; }
  const url = scoped(p.url || "/");
  const data = { url, id: p.id || "", t: p.t || "", c: p.c || "", actions: (p.actions || []).map((a) => ({ action: a.action, url: scoped(a.url || "/") })) };

  event.waitUntil((async () => {
    // Already looking at this exact chat? Don't pop a notification over it.
    if (p.t === "message") {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = wins.find((w) => w.focused && w.visibilityState === "visible" && w.url === url);
      if (open) { open.postMessage({ type: "push", payload: p }); return track("delivered", data); }
    }
    const options = {
      body: p.body || "",
      icon: p.icon ? scoped(p.icon) : undefined,
      badge: p.badge ? scoped(p.badge) : undefined,
      image: p.image ? scoped(p.image) : undefined,
      tag: p.tag || undefined,
      renotify: !!(p.tag && p.renotify),
      requireInteraction: !!p.requireInteraction,
      actions: (p.actions || []).map((a) => ({ action: a.action, title: a.title })),
      data,
      timestamp: Date.now(),
    };
    await Promise.all([self.registration.showNotification(p.title || "", options), track("delivered", data)]);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = (data.actions || []).find((a) => a.action === event.action);
  const target = (action && action.url) || data.url || scoped("/");

  event.waitUntil(Promise.all([
    track("click", data),
    (async () => {
      // Only this site's tabs — never take over a tab of the main site that
      // shares the domain.
      const wins = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter((w) => ours(w.url));
      const same = wins.find((w) => w.url === target) || (ours(target) ? wins[0] : undefined);
      if (same) {
        await same.focus();
        if (same.url !== target && "navigate" in same) { try { await same.navigate(target); } catch (err) { /* cross-scope */ } }
        return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  ]));
});

self.addEventListener("notificationclose", (event) => {
  event.waitUntil(track("close", event.notification.data || {}));
});

// The browser replaced the subscription (keys rotated or it expired):
// subscribe again and tell the site, so this device keeps getting pushes.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      let key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
      if (!key) {
        const cfg = await (await fetch(scoped("/api/push/config"))).json();
        if (!cfg.publicKey) return;
        const b64 = cfg.publicKey.replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
        key = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
      }
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await fetch(scoped("/api/push/subscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), oldEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : undefined, source: "rotate" }),
      });
    } catch (err) { /* the page re-syncs on the next visit */ }
  })());
});
