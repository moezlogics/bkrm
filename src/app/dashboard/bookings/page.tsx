"use client";

/**
 * My bookings, both sides:
 *   - "My bookings": what I booked — status, the provider's number once
 *     confirmed, cancel;
 *   - "For my ads": what people booked with me — a day-by-day summary, each
 *     request with the customer's number (call / WhatsApp), confirm with a
 *     note (e.g. the time), decline with a reason, mark done; for hissa ads a
 *     share list per animal that can be printed.
 * ?tab=received opens the second; ?b=<code> highlights one booking.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CalendarCheck, CalendarDays, Check, Clock, Loader2, MapPin, MessageCircle, Phone, Printer, X, Users, Inbox, ShieldCheck } from "lucide-react";
import { AppBar } from "@/components/layout/AppChrome";
import { PushNudge } from "@/components/push/PushNudge";
import { useToast } from "@/components/ui/Toast";
import { STATUS_TEXT } from "@/lib/bookings/shared";

type B = {
  _id: string; code: string; kind: "service" | "share"; status: string;
  listing: { id: string; name: string; slug: string };
  day: string; dayDate: string | null; dayLabel: string; slotLabel: string | null;
  units: { key: string; label: string; count: number; rate: number | null }[]; totalUnits: number; shares: number; names: string[]; estimate: number | null;
  contactName: string; area: string | null; address: string | null; note: string | null; phone: string | null;
  other: { id: string; name: string; image: string | null } | null;
  providerNote: string | null; reason: string | null; cancelledBy: string | null; createdAt: string;
};

const TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700", confirmed: "bg-emerald-50 text-emerald-700", completed: "bg-blue-50 text-blue-700",
  declined: "bg-red-50 text-red-600", cancelled: "bg-red-50 text-red-600", expired: "bg-slate-100 text-slate-600",
};
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const what = (b: B) => (b.kind === "share" ? (b.shares === 1 ? "1 hissa" : `${b.shares} hissay`) : b.units.map((u) => `${u.count} × ${u.label}`).join(", "));
const wa = (p: string) => `https://wa.me/92${p.replace(/\D/g, "").replace(/^0/, "")}`;

function BookingsInner() {
  const { status } = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const { toast } = useToast();
  const [tab, setTab] = useState<"mine" | "received">(sp.get("tab") === "received" ? "received" : "mine");
  const [view, setView] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<B[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ b: B; action: "confirm" | "decline" | "cancel" } | null>(null);
  const [text, setText] = useState("");
  const highlight = sp.get("b");

  useEffect(() => { if (status === "unauthenticated") router.replace("/login?callbackUrl=/dashboard/bookings"); }, [status, router]);

  const load = useCallback(async () => {
    setRows(null);
    const r = await fetch(`/api/bookings?as=${tab === "received" ? "provider" : "customer"}&status=${view}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (j?.success) { setRows(j.data); setCounts(j.counts || {}); } else setRows([]);
  }, [tab, view]);
  useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);
  useEffect(() => {
    if (!highlight || !rows) return;
    document.getElementById(`bk-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, rows]);

  const act = async (b: B, action: string, t = "") => {
    setBusy(b._id);
    try {
      const r = await fetch(`/api/bookings/${b._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, text: t }) });
      const j = await r.json().catch(() => null);
      if (j?.success) { toast.success(j.message); setAsk(null); setText(""); void load(); } else toast.error(j?.message || "Couldn't do that");
    } finally { setBusy(null); }
  };

  // Received, open: what each day looks like.
  const perDay = useMemo(() => {
    if (tab !== "received" || view !== "open" || !rows) return [];
    const m = new Map<string, { label: string; confirmed: number; pending: number }>();
    for (const b of rows) {
      const k = b.dayLabel || b.day;
      const x = m.get(k) || { label: k, confirmed: 0, pending: 0 };
      if (b.status === "confirmed") x.confirmed += b.totalUnits || b.shares; else x.pending += b.totalUnits || b.shares;
      m.set(k, x);
    }
    return [...m.values()];
  }, [rows, tab, view]);

  // Received: the share list per animal (confirmed hissay with names).
  const registers = useMemo(() => {
    if (tab !== "received" || !rows) return [];
    const m = new Map<string, { ad: B["listing"]; day: string; rows: { name: string; booker: string; code: string }[] }>();
    for (const b of rows.filter((x) => x.kind === "share" && (x.status === "confirmed" || x.status === "completed"))) {
      const r = m.get(b.listing.id) || { ad: b.listing, day: b.dayLabel, rows: [] };
      for (let i = 0; i < b.shares; i++) r.rows.push({ name: b.names[i] || "", booker: b.contactName, code: b.code });
      m.set(b.listing.id, r);
    }
    return [...m.values()];
  }, [rows, tab]);

  const openCount = (counts.pending || 0) + (counts.confirmed || 0);

  return (
    <>
      <AppBar title="Bookings" subtitle={tab === "received" ? "For my ads" : "What I booked"} backHref="/dashboard" />
      <div className="max-w-3xl mx-auto w-full px-4 py-4 pb-12 flex flex-col gap-4 print:p-0">
        <div className="grid grid-cols-2 rounded-xl border border-card-border bg-card p-1 print:hidden">
          {([["mine", "My bookings"], ["received", "For my ads"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); router.replace(`/dashboard/bookings${k === "received" ? "?tab=received" : ""}`); }}
              className={`h-10 rounded-lg text-sm font-bold ${tab === k ? "bg-primary text-white" : "text-content-secondary hover:bg-surface-secondary"}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 print:hidden">
          <div className="flex gap-1.5">
            {(["open", "closed"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`h-8 px-3 rounded-full border text-xs font-semibold ${view === v ? "border-primary bg-primary/10 text-primary" : "border-card-border text-content-secondary"}`}>
                {v === "open" ? `Open${openCount ? ` (${openCount})` : ""}` : "Closed"}
              </button>
            ))}
          </div>
          {tab === "received" && counts.pending ? <span className="text-xs font-bold text-amber-700">{counts.pending} waiting for your answer</span> : null}
        </div>

        <PushNudge context="booking" className="print:hidden" />

        {perDay.length > 0 && (
          <section className="rounded-2xl border border-card-border bg-card p-4 print:hidden">
            <h2 className="text-sm font-bold text-content flex items-center gap-2 mb-2"><CalendarDays className="h-4 w-4 text-primary" /> Your days</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {perDay.map((d) => (
                <div key={d.label} className="rounded-xl bg-surface-secondary px-3 py-2">
                  <p className="text-[12px] font-bold text-content">{d.label}</p>
                  <p className="text-[11px] text-content-secondary">{d.confirmed} confirmed{d.pending ? ` · ${d.pending} waiting` : ""}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {rows === null ? (
          <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-card-border bg-card px-6 py-12 text-center print:hidden">
            <span className="mx-auto grid place-items-center h-14 w-14 rounded-full bg-surface-secondary text-content-tertiary"><Inbox className="h-6 w-6" /></span>
            <p className="mt-3 font-semibold text-content">{view === "open" ? "No open bookings" : "Nothing here yet"}</p>
            <p className="mt-1 text-sm text-content-secondary">
              {tab === "received" ? "When someone books through your ad, it shows here and you get a notification." : "Book a qasai or a hissa from their ad — your bookings show here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 print:hidden">
            {rows.map((b) => (
              <article key={b._id} id={`bk-${b.code}`} className={`rounded-2xl border bg-card p-4 flex flex-col gap-3 ${highlight === b.code ? "border-primary ring-2 ring-primary/20" : "border-card-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/ads/${b.listing.slug}`} className="text-sm font-bold text-content hover:text-primary line-clamp-2">{b.listing.name}</Link>
                    <p className="text-[11px] text-content-tertiary font-mono mt-0.5">{b.code}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE[b.status] || TONE.expired}`}>{STATUS_TEXT[b.status] || b.status}</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] text-content-secondary">
                  <span className="flex items-start gap-1.5"><CalendarCheck className="h-4 w-4 text-primary shrink-0 mt-px" /> <span className="min-w-0"><b className="text-content">{b.dayLabel}</b>{b.slotLabel ? <span className="block text-[12px]">{b.slotLabel}</span> : null}</span></span>
                  <span className="flex items-start gap-1.5"><Users className="h-4 w-4 text-primary shrink-0 mt-px" /> <span className="min-w-0">{what(b)}{b.estimate != null ? <b className="block text-content">{rs(b.estimate)} <span className="font-normal text-[11px] text-content-tertiary">estimate</span></b> : null}</span></span>
                  {(b.area || b.address) && <span className="flex items-start gap-1.5 sm:col-span-2"><MapPin className="h-4 w-4 text-primary shrink-0 mt-px" /> <span className="min-w-0">{[b.address, b.area].filter(Boolean).join(", ")}</span></span>}
                </div>
                {b.kind === "share" && b.names.some(Boolean) && <p className="text-[12px] text-content-secondary">Names: {b.names.filter(Boolean).join(" · ")}</p>}
                {b.note && <p className="rounded-xl bg-surface-secondary px-3 py-2 text-[12px] text-content-secondary">“{b.note}”</p>}
                {b.providerNote && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900"><b>Provider&apos;s note:</b> {b.providerNote}</p>}
                {b.reason && ["declined", "cancelled", "expired"].includes(b.status) && <p className="text-[12px] text-red-600">{b.cancelledBy === "customer" ? "Cancelled by the customer" : b.cancelledBy === "provider" ? "Cancelled by the provider" : b.cancelledBy === "admin" ? "Cancelled by our team" : "Reason"}: {b.reason}</p>}

                {/* The other side */}
                <div className="flex items-center gap-3 border-t border-card-border pt-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-content-tertiary">{tab === "received" ? "Booked by" : "With"}</p>
                    <p className="text-sm font-semibold text-content truncate">{tab === "received" ? b.contactName : b.other?.name || "Provider"}</p>
                  </div>
                  {b.phone && (
                    <div className="flex gap-1.5 shrink-0">
                      <a href={`tel:${b.phone}`} className="h-9 px-3 rounded-lg border border-card-border text-xs font-bold text-content inline-flex items-center gap-1.5 hover:border-primary"><Phone className="h-3.5 w-3.5" /> Call</a>
                      <a href={wa(b.phone)} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-lg bg-[#25D366] text-white text-xs font-bold inline-flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {tab === "received" && b.status === "pending" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setAsk({ b, action: "confirm" }); setText(""); }} disabled={busy === b._id} className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Confirm</button>
                    <button onClick={() => { setAsk({ b, action: "decline" }); setText(""); }} disabled={busy === b._id} className="h-11 rounded-xl border border-card-border text-red-600 text-sm font-bold inline-flex items-center justify-center gap-1.5 hover:bg-red-50"><X className="h-4 w-4" /> Decline</button>
                  </div>
                )}
                {tab === "received" && b.status === "confirmed" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => act(b, "complete")} disabled={busy === b._id} className="h-11 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold inline-flex items-center justify-center gap-1.5">{busy === b._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark done</button>
                    <button onClick={() => { setAsk({ b, action: "cancel" }); setText(""); }} className="h-11 rounded-xl border border-card-border text-red-600 text-sm font-bold hover:bg-red-50">Cancel</button>
                  </div>
                )}
                {tab === "mine" && (b.status === "pending" || b.status === "confirmed") && (
                  <button onClick={() => { setAsk({ b, action: "cancel" }); setText(""); }} className="h-10 rounded-xl border border-card-border text-red-600 text-sm font-semibold hover:bg-red-50">Cancel booking</button>
                )}
                {tab === "mine" && b.status === "completed" && b.other && (
                  <Link href={`/shop/${b.other.id}#reviews`} className="h-10 rounded-xl border border-card-border text-primary text-sm font-semibold grid place-items-center hover:border-primary">Rate {b.other.name}</Link>
                )}
              </article>
            ))}
          </div>
        )}

        {registers.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between print:hidden">
              <h2 className="text-sm font-bold text-content flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Share lists</h2>
              <button onClick={() => window.print()} className="h-9 px-3 rounded-lg border border-card-border text-xs font-bold inline-flex items-center gap-1.5 hover:border-primary"><Printer className="h-3.5 w-3.5" /> Print</button>
            </div>
            {registers.map((r) => (
              <div key={r.ad.id} className="rounded-2xl border border-card-border bg-card p-4 print:border-black print:rounded-none">
                <p className="text-sm font-bold text-content">{r.ad.name}</p>
                <p className="text-[12px] text-content-secondary">{r.day} · {r.rows.length} hissay confirmed</p>
                <ol className="mt-2 divide-y divide-card-border text-sm">
                  {r.rows.map((x, i) => (
                    <li key={i} className="py-1.5 flex justify-between gap-3"><span><b>{i + 1}.</b> {x.name || <span className="text-content-tertiary">name not given</span>}</span><span className="text-[12px] text-content-tertiary">{x.booker} · {x.code}</span></li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        )}

        {tab === "mine" && view === "open" && (
          <p className="text-center text-[12px] text-content-tertiary print:hidden"><Clock className="inline h-3.5 w-3.5 -mt-0.5" /> Pay in person, after the work or when you see the animal. Never send an advance.</p>
        )}
      </div>

      {ask && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/55" onClick={() => setAsk(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-card-border p-5 flex flex-col gap-3">
            <h3 className="font-bold text-content">{ask.action === "confirm" ? "Confirm this booking" : ask.action === "decline" ? "Decline this booking" : "Cancel this booking"}</h3>
            <p className="text-[13px] text-content-secondary">{what(ask.b)} · {ask.b.dayLabel}{ask.b.slotLabel ? ` · ${ask.b.slotLabel}` : ""}</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} autoFocus
              placeholder={ask.action === "confirm" ? "Optional note, e.g. “We'll come at 8:30 am, keep the animal tied near the gate.”" : "Reason (they'll see it), e.g. “Day 1 is full — I can do day 2.”"}
              className="w-full rounded-xl border border-card-border px-3.5 py-3 text-sm outline-none bg-surface focus:border-primary" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAsk(null)} className="h-11 rounded-xl border border-card-border text-sm font-semibold">Back</button>
              <button onClick={() => act(ask.b, ask.action, text)} disabled={busy === ask.b._id || (ask.action !== "confirm" && !text.trim())}
                className={`h-11 rounded-xl text-white text-sm font-bold disabled:opacity-50 ${ask.action === "confirm" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
                {busy === ask.b._id ? <Loader2 className="h-4 w-4 animate-spin inline" /> : ask.action === "confirm" ? "Confirm" : ask.action === "decline" ? "Decline" : "Cancel booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function BookingsPage() {
  return <Suspense fallback={<div className="py-24 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><BookingsInner /></Suspense>;
}
