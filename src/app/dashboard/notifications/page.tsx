"use client";

/**
 * My notifications (the bell): everything the site told me — ad approved,
 * offers, plan and payment updates, reminders, bookings — newest first.
 * Tapping one marks it read and opens it. Settings (push on this device,
 * categories, devices) are one tap away.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell, CheckCheck, Loader2, Settings, MessageSquare, BadgeCheck, XCircle, Rocket, Crown, CreditCard, Clock,
  TrendingDown, Heart, Eye, Star, ShieldCheck, ShieldAlert, CalendarCheck, CalendarX, CalendarClock, PackageX, Hourglass,
} from "lucide-react";
import { AppBar, AppBarLink } from "@/components/layout/AppChrome";
import { PushNudge } from "@/components/push/PushNudge";
import { refreshBadges, setNotificationBadge } from "@/lib/badges-client";

type N = { id: string; type: string; title: string; body: string; url: string; icon: string | null; read: boolean; at: string };

const LOOK: Record<string, { icon: React.ElementType; tone: string }> = {
  offer_received: { icon: MessageSquare, tone: "bg-primary/10 text-primary" },
  offer_accepted: { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-600" },
  offer_rejected: { icon: XCircle, tone: "bg-red-50 text-red-600" },
  reply_reminder: { icon: Clock, tone: "bg-amber-50 text-amber-600" },
  listing_approved: { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-600" },
  listing_rejected: { icon: XCircle, tone: "bg-red-50 text-red-600" },
  views_milestone: { icon: Eye, tone: "bg-primary/10 text-primary" },
  favourite: { icon: Heart, tone: "bg-rose-50 text-rose-600" },
  review_received: { icon: Star, tone: "bg-amber-50 text-amber-600" },
  boost_offer: { icon: Rocket, tone: "bg-primary/10 text-primary" },
  boost_unused: { icon: Rocket, tone: "bg-primary/10 text-primary" },
  boost_ending: { icon: Hourglass, tone: "bg-amber-50 text-amber-600" },
  ad_expiring: { icon: Hourglass, tone: "bg-amber-50 text-amber-600" },
  ad_expired: { icon: PackageX, tone: "bg-red-50 text-red-600" },
  price_drop: { icon: TrendingDown, tone: "bg-emerald-50 text-emerald-600" },
  saved_sold: { icon: PackageX, tone: "bg-slate-100 text-slate-600" },
  plan_activated: { icon: Crown, tone: "bg-emerald-50 text-emerald-600" },
  payment_rejected: { icon: CreditCard, tone: "bg-red-50 text-red-600" },
  plan_expiring: { icon: Crown, tone: "bg-amber-50 text-amber-600" },
  plan_expired: { icon: Crown, tone: "bg-slate-100 text-slate-600" },
  payment_submitted: { icon: CreditCard, tone: "bg-primary/10 text-primary" },
  verification_approved: { icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600" },
  verification_rejected: { icon: ShieldAlert, tone: "bg-red-50 text-red-600" },
  verification_submitted: { icon: ShieldCheck, tone: "bg-primary/10 text-primary" },
  booking_request: { icon: CalendarClock, tone: "bg-primary/10 text-primary" },
  booking_confirmed: { icon: CalendarCheck, tone: "bg-emerald-50 text-emerald-600" },
  booking_declined: { icon: CalendarX, tone: "bg-red-50 text-red-600" },
  booking_cancelled: { icon: CalendarX, tone: "bg-red-50 text-red-600" },
  booking_reminder: { icon: CalendarClock, tone: "bg-amber-50 text-amber-600" },
};

function when(iso: string) {
  const d = new Date(iso), now = Date.now(), mins = Math.round((now - d.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const dayGroup = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  if (d.getTime() >= start) return "Today";
  if (d.getTime() >= start - 86_400_000) return "Yesterday";
  if (d.getTime() >= start - 6 * 86_400_000) return "This week";
  return "Earlier";
};

export default function NotificationsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<N[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => { if (status === "unauthenticated") router.replace("/login?callbackUrl=/dashboard/notifications"); }, [status, router]);

  const load = useCallback(async (before?: string) => {
    const r = await fetch(`/api/notifications${before ? `?before=${encodeURIComponent(before)}` : ""}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!j?.success) { setItems((x) => x || []); return; }
    setItems((x) => (before && x ? [...x, ...j.data] : j.data));
    setUnread(j.unread);
    setNotificationBadge(j.unread);
    setMore(!!j.more);
  }, []);
  useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);

  const mark = async (body: object) => {
    const r = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (j?.success) { setUnread(j.unread); setNotificationBadge(j.unread); }
  };
  const open = (n: N) => {
    if (!n.read) {
      setItems((x) => x?.map((i) => (i.id === n.id ? { ...i, read: true } : i)) || x);
      void mark({ ids: [n.id] });
    }
    router.push(n.url || "/");
  };
  const readAll = async () => {
    setBusy("all");
    await mark({ all: true });
    setItems((x) => x?.map((i) => ({ ...i, read: true })) || x);
    setBusy("");
    refreshBadges();
  };
  const loadMore = async () => {
    if (!items?.length) return;
    setBusy("more");
    await load(items[items.length - 1].at);
    setBusy("");
  };

  const groups: [string, N[]][] = [];
  for (const n of items || []) {
    const g = dayGroup(n.at);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(n); else groups.push([g, [n]]);
  }

  return (
    <>
      <AppBar
        title="Notifications"
        subtitle={unread ? `${unread} unread` : undefined}
        backHref="/dashboard"
        right={<>
          {unread > 0 && (
            <button onClick={readAll} disabled={busy === "all"} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold text-primary hover:bg-primary/5" aria-label="Mark all as read">
              {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} <span className="hidden sm:inline">Mark all read</span>
            </button>
          )}
          <AppBarLink href="/dashboard/notifications/settings" label="Notification settings"><Settings className="h-5 w-5" /></AppBarLink>
        </>}
      />
      <div className="max-w-2xl mx-auto w-full px-4 py-4 flex flex-col gap-4 pb-10">
        <PushNudge context="inbox" />

        {items === null ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-card-border bg-card px-6 py-14 text-center">
            <span className="mx-auto grid place-items-center h-14 w-14 rounded-full bg-surface-secondary text-content-tertiary"><Bell className="h-6 w-6" /></span>
            <p className="mt-3 font-semibold text-content">No notifications yet</p>
            <p className="mt-1 text-sm text-content-secondary">Offers, ad approvals, plan updates and reminders will show up here.</p>
          </div>
        ) : (
          groups.map(([label, rows]) => (
            <section key={label}>
              <h2 className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">{label}</h2>
              <div className="rounded-2xl border border-card-border bg-card overflow-hidden divide-y divide-card-border">
                {rows.map((n) => {
                  const look = LOOK[n.type] || { icon: Bell, tone: "bg-primary/10 text-primary" };
                  return (
                    <button key={n.id} onClick={() => open(n)} className={`w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-surface-secondary active:bg-surface-tertiary transition-colors ${n.read ? "" : "bg-primary/[0.04]"}`}>
                      <span className={`grid place-items-center h-10 w-10 rounded-full shrink-0 ${look.tone}`}><look.icon className="h-4.5 w-4.5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm leading-snug ${n.read ? "font-medium text-content" : "font-semibold text-content"}`}>{n.title}</span>
                        {n.body && <span className="block text-[13px] text-content-secondary leading-snug mt-0.5 line-clamp-3">{n.body}</span>}
                        <span className="block text-[11px] text-content-tertiary mt-1" suppressHydrationWarning>{when(n.at)}</span>
                      </span>
                      {!n.read && <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary shrink-0" aria-label="Unread" />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}

        {more && (
          <button onClick={loadMore} disabled={busy === "more"} className="h-11 rounded-xl border border-card-border bg-card text-sm font-semibold text-content hover:bg-surface-secondary inline-flex items-center justify-center gap-2">
            {busy === "more" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Show older
          </button>
        )}
        <p className="text-center text-[11px] text-content-tertiary">Notifications are kept for 4 months. <Link href="/dashboard/notifications/settings" className="font-semibold text-primary">Choose what you get</Link></p>
      </div>
    </>
  );
}
