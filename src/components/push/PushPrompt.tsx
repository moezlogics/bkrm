"use client";

/**
 * Asks visitors to allow notifications — the way large sites do it:
 *   - our own card first ("soft ask"); the browser's permission dialog only
 *     appears after they tap Allow, so a "no" here doesn't block us forever;
 *   - not on the first page, not straight away (admin: page views + delay),
 *     never on excluded pages, and "Not now" snoozes it for N days;
 *   - right after a meaningful action (posted an ad, saved one, sent a chat)
 *     it asks with wording for that moment;
 *   - on iPhone it explains Add to Home Screen, the only way iOS allows it.
 * Everything it says comes from Admin → Push notifications → Settings.
 *
 * When notifications are already allowed it silently keeps this device's
 * record current (account, location) on each visit.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, Loader2, Share, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  getPushConfigClient, pushSupport, pushPermission, enablePush, syncPush, withBase, PUSH_ASK_KEY, type ClientPushConfig,
} from "@/lib/push-client";

const LS = { views: "push_pv", snooze: "push_snooze", ctxAt: "push_ctx_at" };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

type Ask = { title: string; body: string; source: string; ios: boolean };

/**
 * Chrome, Edge, Opera, Samsung Internet and Android Chrome show the browser's
 * permission prompt without a tap. Firefox and Safari only show it after the
 * person taps something, so they always get our card first.
 */
function browserPromptWithoutTap() {
  const ua = navigator.userAgent;
  if (/Firefox\/|FxiOS/.test(ua)) return false;
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS|Edg\//.test(ua)) return false;
  return /Chrome\/|Chromium\/|Edg\//.test(ua);
}

export function PushPrompt() {
  const pathname = usePathname() || "/";
  const { data: session, status } = useSession();
  const who = (session?.user as any)?.id || (session as any)?.userId || "";
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ClientPushConfig | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { getPushConfigClient().then(setCfg); }, []);

  // Already allowed: keep the device record current (also re-links the
  // account after signing in on this device).
  useEffect(() => {
    if (status === "loading" || !cfg?.enabled) return;
    if (pushPermission() === "granted") void syncPush(who);
  }, [cfg, status, who]);

  const excluded = useCallback(
    (path: string) => !!cfg?.prompt.excludePaths.some((p) => p && (path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || path === p)),
    [cfg],
  );
  const canAsk = useCallback(() => {
    if (!cfg?.enabled || !cfg.prompt.enabled) return null;
    const support = pushSupport();
    if (support === "unsupported") return null;
    if (support === "ok" && pushPermission() !== "default") return null;
    return support;
  }, [cfg]);

  // The general ask: after N page views and a delay on the page.
  useEffect(() => {
    if (!cfg || status === "loading") return;
    const views = Number(read(LS.views) || 0) + 1;
    write(LS.views, String(views));
    if (timer.current) clearTimeout(timer.current);
    const support = canAsk();
    if (!support || excluded(pathname) || ask) return;
    if (Date.now() < Number(read(LS.snooze) || 0) || views < cfg.prompt.minPageViews) return;
    timer.current = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      if (cfg.prompt.style === "browser" && support === "ok" && browserPromptWithoutTap()) {
        void askBrowser("prompt");
        return;
      }
      setAsk({ title: cfg.prompt.title, body: cfg.prompt.body, source: "prompt", ios: support === "ios-install" });
    }, Math.max(0, cfg.prompt.delaySec) * 1000);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, cfg, status]);

  // Contextual asks (askForPush): allowed even when the general one was
  // snoozed. Each moment asks at most once every 3 days (so asking after a
  // chat never blocks the ask after a booking or a payment), and two asks
  // never come within a minute of each other.
  const contextAsk = useCallback((context: string) => {
    const support = canAsk();
    if (!support || !cfg) return;
    const key = `${LS.ctxAt}_${context || "prompt"}`;
    if (Date.now() - Number(read(key) || 0) < 3 * 86_400_000) return;
    if (Date.now() - Number(read(LS.ctxAt) || 0) < 60_000) return;
    const copy = cfg.prompt.contexts[context] || { title: cfg.prompt.title, body: cfg.prompt.body };
    write(key, String(Date.now()));
    write(LS.ctxAt, String(Date.now()));
    setAsk({ ...copy, source: context || "prompt", ios: support === "ios-install" });
  }, [cfg, canAsk]);

  useEffect(() => {
    const onAsk = (e: Event) => contextAsk(String((e as CustomEvent).detail || ""));
    window.addEventListener("push:ask", onAsk);
    // Posting an ad opens the ad page: the ask carries over that one navigation.
    try {
      const pending = sessionStorage.getItem(PUSH_ASK_KEY);
      if (pending) { sessionStorage.removeItem(PUSH_ASK_KEY); setTimeout(() => contextAsk(pending), 1200); }
    } catch { /* private mode */ }
    return () => window.removeEventListener("push:ask", onAsk);
  }, [contextAsk]);

  const later = () => {
    write(LS.snooze, String(Date.now() + (cfg?.prompt.snoozeDays || 7) * 86_400_000));
    setAsk(null);
  };
  // The browser's own prompt, straight away ("browser" style). Closing it
  // without choosing snoozes like "Not now"; blocking snoozes for 90 days.
  async function askBrowser(source: string) {
    const r = await enablePush(source, who);
    if (r.ok) { toast.success("Notifications are on"); return; }
    const perm = pushPermission();
    write(LS.snooze, String(Date.now() + (perm === "denied" ? 90 : cfg?.prompt.snoozeDays || 7) * 86_400_000));
  }

  const allow = async () => {
    if (!ask) return;
    setBusy(true);
    const r = await enablePush(ask.source, who);
    setBusy(false);
    setAsk(null);
    if (r.ok) toast.success("Notifications are on");
    else if (r.reason === "denied") {
      write(LS.snooze, String(Date.now() + 90 * 86_400_000));
      toast.error("Notifications are blocked in your browser settings");
    } else toast.error("Couldn't turn on notifications on this browser");
  };

  if (!ask || !cfg) return null;
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={ask.title}
      className="fixed z-[70] left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] sm:left-auto sm:right-5 sm:bottom-5 sm:w-[380px] rounded-2xl bg-card shadow-sm ring-1 ring-black/[0.03] shadow-xl p-4 animate-slide-up"
    >
      <button onClick={later} aria-label="Close" className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-content-tertiary hover:bg-surface-secondary"><X className="h-4 w-4" /></button>
      <div className="flex gap-3 pr-6">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 grid place-items-center overflow-hidden">
          {cfg.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={withBase(cfg.icon)} alt="" className="h-7 w-7 object-contain" />
          ) : <Bell className="h-5 w-5 text-primary" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-content leading-snug">{ask.title}</p>
          <p className="text-xs text-content-secondary mt-1 leading-relaxed">{ask.body}</p>
        </div>
      </div>
      {ask.ios ? (
        <p className="mt-3 rounded-xl bg-surface-secondary px-3 py-2.5 text-xs text-content-secondary leading-relaxed">
          On iPhone: tap <Share className="inline h-3.5 w-3.5 -mt-0.5" /> <b>Share</b>, then <b>Add to Home Screen</b>. Open {cfg.siteName} from your Home Screen and turn notifications on there.
        </p>
      ) : (
        <div className="mt-3.5 flex gap-2">
          <button onClick={later} className="flex-1 h-10 rounded-xl border border-card-border text-sm font-semibold text-content-secondary hover:bg-surface-secondary">{cfg.prompt.later}</button>
          <button onClick={allow} disabled={busy} className="flex-1 h-10 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} {cfg.prompt.allow}
          </button>
        </div>
      )}
    </div>
  );
}
