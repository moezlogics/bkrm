"use client";

/**
 * An inline "turn on notifications" card for the places where they matter
 * most — the notification list, chats, my ads, plans, bookings. Shows only
 * while this device can get notifications but hasn't been asked yet (not
 * after "Block", not when they're on). On iPhone it explains Add to Home
 * Screen, the only way iOS allows web notifications.
 */
import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BellRing, Loader2, Share, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { enablePush, getPushConfigClient, pushPermission, pushSupport, type AskContext } from "@/lib/push-client";

const HIDE_KEY = "push_nudge_hide";

export function PushNudge({ context, className = "" }: { context: AskContext; className?: string }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [copy, setCopy] = useState<{ title: string; body: string; site: string } | null>(null);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    const support = pushSupport();
    if (support === "unsupported") return;
    if (support === "ok" && pushPermission() !== "default") return;
    try {
      const until = Number(localStorage.getItem(`${HIDE_KEY}_${context}`) || 0);
      if (Date.now() < until) return;
    } catch { /* private mode */ }
    getPushConfigClient().then((cfg) => {
      if (off || !cfg?.enabled) return;
      const c = cfg.prompt.contexts[context] || { title: cfg.prompt.title, body: cfg.prompt.body };
      setIos(support === "ios-install");
      setCopy({ ...c, site: cfg.siteName });
    });
    return () => { off = true; };
  }, [context]);

  if (!copy) return null;

  const hide = () => {
    try { localStorage.setItem(`${HIDE_KEY}_${context}`, String(Date.now() + 14 * 86_400_000)); } catch { /* ignore */ }
    setCopy(null);
  };
  const allow = async () => {
    setBusy(true);
    const r = await enablePush(`nudge:${context}`, (session?.user as any)?.id || "");
    setBusy(false);
    if (r.ok) { toast.success("Notifications are on"); setCopy(null); }
    else if (r.reason === "denied") { toast.error("Your browser is blocking notifications — allow them in the site settings"); setCopy(null); }
    else toast.error("Couldn't turn on notifications on this browser");
  };

  return (
    <div role="region" aria-label={copy.title} className={`relative rounded-2xl border border-primary/25 bg-primary/5 p-3.5 pr-10 ${className}`}>
      <button onClick={hide} aria-label="Hide" className="absolute top-2 right-2 grid place-items-center h-7 w-7 rounded-full text-content-tertiary hover:bg-surface-secondary"><X className="h-4 w-4" /></button>
      <div className="flex items-start gap-3">
        <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-primary text-white"><BellRing className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-content leading-snug">{copy.title}</p>
          <p className="text-[13px] text-content-secondary mt-0.5 leading-snug">{copy.body}</p>
          {ios ? (
            <p className="mt-2 text-[13px] text-content-secondary leading-relaxed">
              On iPhone: tap <Share className="inline h-3.5 w-3.5 -mt-0.5" /> <b>Share</b> → <b>Add to Home Screen</b>, open {copy.site} from there and turn notifications on.
            </p>
          ) : (
            <button onClick={allow} disabled={busy} className="mt-2.5 inline-flex items-center gap-2 h-9 rounded-xl bg-primary hover:bg-primary-dark px-3.5 text-[14px] font-semibold text-white disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Turn on notifications
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
