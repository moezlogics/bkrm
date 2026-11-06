"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * "Finish what you started" login flow.
 *
 * When a logged-out visitor taps Chat / WhatsApp / Call / Save / Report /
 * Review, we don't just send them to /login and drop them back on the page —
 * we remember *what they were doing* and replay it once they're in.
 *
 * The intent rides inside the callbackUrl (`/ads/x?intent=chat`) rather than
 * as a separate param, so it survives both the credentials flow and the
 * Google OAuth round-trip without any extra plumbing.
 */

export type Intent = "chat" | "whatsapp" | "call" | "offer" | "save" | "report" | "review" | "post";

/** Build the login URL that will return here and resume `intent`. */
export function loginUrl(returnTo: string, intent?: Intent): string {
  const target = intent
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}intent=${encodeURIComponent(intent)}`
    : returnTo;
  return `/login?callbackUrl=${encodeURIComponent(target)}`;
}

/**
 * Replay a pending intent after login.
 *
 * Pass the handlers this page can resume. `ready` gates execution until the
 * session (and anything else the handler needs) has loaded — otherwise the
 * handler would run before `session` exists and bounce back to /login.
 */
export function useResumeIntent(
  handlers: Partial<Record<Intent, () => void>>,
  ready: boolean = true
) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (!ready || fired.current) return;
    const intent = params.get("intent") as Intent | null;
    if (!intent) return;
    const run = handlers[intent];
    if (!run) return;

    fired.current = true;

    // Drop ?intent= first so a refresh (or the browser back button) doesn't
    // fire the same action again.
    const rest = new URLSearchParams(params.toString());
    rest.delete("intent");
    const qs = rest.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });

    run();
  }, [ready, params, pathname, router, handlers]);
}

/**
 * Where to go after logging in / signing up, from ?callbackUrl= — only ever a
 * page on this site. An absolute or protocol-relative URL to another site used
 * to be followed as-is (window.location.assign), so a link like
 * /login?callbackUrl=https://evil.example sent people to a fake page right
 * after they had typed their password.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const fallback = `${base}/dashboard`;
  if (!raw) return fallback;
  let path = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//") || path.includes("\\")) {
    const origin = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || "";
    try {
      const u = new URL(path, origin || "http://invalid.local");
      if (!origin || u.origin !== new URL(origin).origin) return fallback;
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch { return fallback; }
  }
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  const full = base && (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`)) ? path : `${base}${path}`;
  // Never back to the login/sign-up pages themselves.
  if (/^\/(login|signup)(\/|\?|$)/.test(full.slice(base.length))) return fallback;
  return full;
}

const REASONS: Partial<Record<Intent, string>> = {
  chat: "Log in to message the seller",
  whatsapp: "Log in to see the seller's WhatsApp",
  call: "Log in to see the seller's number",
  offer: "Log in to make an offer",
  save: "Log in to save this ad",
  report: "Log in to report this",
  review: "Log in to post a verified review",
  post: "Log in to post your ad",
};

/** What the visitor was about to do, for the login/sign-up heading ("Log in to message the seller"). */
export function intentReason(callbackUrl: string): string | null {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  try {
    const u = new URL(callbackUrl, "http://x.local");
    const intent = u.searchParams.get("intent") as Intent | null;
    if (intent && REASONS[intent]) return REASONS[intent]!;
    const p = u.pathname.slice(base.length) || "/";
    if (p.startsWith("/ads/post")) return REASONS.post!;
    if (p.startsWith("/chat")) return "Log in to see your messages";
    if (p.startsWith("/dashboard/saved")) return "Log in to see your saved ads";
    if (p.startsWith("/dashboard/plans")) return "Log in to see plans";
  } catch { /* fall through */ }
  return null;
}
