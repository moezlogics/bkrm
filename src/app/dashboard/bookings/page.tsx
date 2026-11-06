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
import { CalendarCheck, Check, Loader2, MessageCircle, Phone, Printer, X } from "lucide-react";
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
  pending: "bg-amber-50 text-amber-700", confirmed: "bg-primary-soft text-primary-dark", completed: "bg-surface-tertiary text-content",
  declined: "bg-danger-light text-danger", cancelled: "bg-danger-light text-danger", expired: "bg-surface-tertiary text-content-tertiary",
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
      <AppBar title="Bookings" backHref="/dashboard" />
      <div className="max-w-3xl mx-auto w-full px-4 pt-4 pb-12 flex flex-col gap-3 print:p-0">
        <div className="grid grid-cols-2 rounded-full bg-surface-tertiary/70 p-1 print:hidden">
          {([["mine", "My bookings"], ["received", "For my ads"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); router.replace(`/dashboard/bookings${k === "received" ? "?tab=received" : ""}`); }}
              className={`h-10 rounded-full text-[15px] font-bold transition-colors ${tab === k ? "bg-white text-content shadow-sm" : "text-content-secondary"}`}>{label}</button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 print:hidden">
          <div className="flex gap-1.5">
            {(["open", "closed"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`h-9 px-4 rounded-full text-[14px] font-semibold transition-colors ${view === v ? "bg-content text-white" : "bg-white text-content-secondary ring-1 ring-card-border"}`}>
                {v === "open" ? `Open${openCount ? ` · ${openCount}` : ""}` : "Closed"}
              </button>
            ))}
          </div>
          {tab === "received" && counts.pending ? <span className="text-[13.5px] font-bold text-amber-700">{counts.pending} waiting for you</span> : null}
        </div>

        <PushNudge context="booking" className="print:hidden" />

        {perDay.length > 0 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar print:hidden">
            {perDay.map((d) => (
              <div key={d.label} className="shrink-0 card !rounded-2xl px-4 py-3 min-w-[132px]">
                <p className="text-[13px] font-semibold text-content-tertiary">{d.label}</p>
                <p className="mt-0.5 text-[18px] font-extrabold text-content leading-tight">{d.confirmed}<span className="text-[13px] font-semibold text-content-tertiary"> confirmed</span></p>
                {d.pending > 0 && <p className="text-[13px] font-semibold text-amber-700">{d.pending} waiting</p>}
              </div>
            ))}
          </div>
        )}

        {rows === null ? (
          <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="card px-6 py-14 text-center print:hidden">
            <span className="mx-auto grid place-items-center h-16 w-16 rounded-2xl bg-primary-soft text-primary"><CalendarCheck className="h-7 w-7" /></span>
            <p className="mt-4 text-[16px] font-bold text-content">{view === "open" ? "No open bookings" : "Nothing here yet"}</p>
            <p className="mt-1 text-[15px] text-content-secondary max-w-xs mx-auto">
              {tab === "received" ? "When someone books through your ad, it shows here and you get a notification." : "Book a qasai or a hissa from their ad — it shows here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 print:hidden">
            {rows.map((b) => {
              const otherName = tab === "received" ? b.contactName : b.other?.name || "Provider";
              return (
                <article key={b._id} id={`bk-${b.code}`} className={`card p-4 flex flex-col gap-3.5 ${highlight === b.code ? "ring-2 ring-primary/40" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/ads/${b.listing.slug}`} className="text-[15px] font-bold text-content hover:text-primary line-clamp-2 leading-snug">{b.listing.name}</Link>
                      <p className="text-[13px] text-content-tertiary mt-0.5">No. <span className="font-mono">{b.code}</span></p>
                    </div>
                    <span className={`shrink-0 h-7 px-3 rounded-full inline-flex items-center text-[13px] font-bold ${TONE[b.status] || TONE.expired}`}>{STATUS_TEXT[b.status] || b.status}</span>
                  </div>

                  <dl className="grid grid-cols-2 gap-2">
                    <Fact label="When" value={b.dayLabel} sub={b.slotLabel || undefined} />
                    <Fact label={b.kind === "share" ? "Shares" : "Animals"} value={what(b)} sub={b.estimate != null ? `${rs(b.estimate)} estimate` : undefined} />
                    {(b.area || b.address) && <Fact label="Address" value={[b.address, b.area].filter(Boolean).join(", ")} wide />}
                    {b.kind === "share" && b.names.some(Boolean) && <Fact label="Names" value={b.names.filter(Boolean).join(" · ")} wide />}
                  </dl>

                  {b.note && <p className="rounded-2xl bg-surface-secondary px-3.5 py-2.5 text-[14px] text-content-secondary">“{b.note}”</p>}
                  {b.providerNote && <p className="rounded-2xl bg-primary-soft px-3.5 py-2.5 text-[14px] text-primary-dark"><b>Note from provider:</b> {b.providerNote}</p>}
                  {b.reason && ["declined", "cancelled", "expired"].includes(b.status) && (
                    <p className="text-[14px] text-danger">{b.cancelledBy === "customer" ? "Cancelled by the customer" : b.cancelledBy === "provider" ? "Cancelled by the provider" : b.cancelledBy === "admin" ? "Cancelled by our team" : "Reason"}: {b.reason}</p>
                  )}

                  {/* The other side */}
                  <div className="flex items-center gap-3 pt-3.5 border-t border-card-border">
                    <span className="h-10 w-10 rounded-full bg-primary-soft text-primary-dark grid place-items-center font-bold shrink-0">{otherName[0]?.toUpperCase() || "?"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-content-tertiary">{tab === "received" ? "Booked by" : "With"}</p>
                      <p className="text-[14.5px] font-semibold text-content truncate">{otherName}</p>
                    </div>
                    {b.phone && (
                      <div className="flex gap-2 shrink-0">
                        <a href={`tel:${b.phone}`} aria-label={`Call ${otherName}`} className="grid place-items-center h-10 w-10 rounded-full bg-surface-secondary text-content"><Phone className="h-[18px] w-[18px]" /></a>
                        <a href={wa(b.phone)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${otherName}`} className="grid place-items-center h-10 w-10 rounded-full bg-whatsapp text-white"><MessageCircle className="h-[18px] w-[18px]" /></a>
                      </div>
                    )}
                  </div>

                  {tab === "received" && b.status === "pending" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { setAsk({ b, action: "decline" }); setText(""); }} disabled={busy === b._id} className="h-12 rounded-2xl bg-danger-light text-danger text-[15px] font-bold inline-flex items-center justify-center gap-1.5"><X className="h-4 w-4" /> Decline</button>
                      <button onClick={() => { setAsk({ b, action: "confirm" }); setText(""); }} disabled={busy === b._id} className="h-12 rounded-2xl bg-primary hover:bg-primary-dark text-white text-[15px] font-bold inline-flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Confirm</button>
                    </div>
                  )}
                  {tab === "received" && b.status === "confirmed" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { setAsk({ b, action: "cancel" }); setText(""); }} className="h-12 rounded-2xl bg-surface-secondary text-danger text-[15px] font-bold">Cancel</button>
                      <button onClick={() => act(b, "complete")} disabled={busy === b._id} className="h-12 rounded-2xl bg-primary hover:bg-primary-dark text-white text-[15px] font-bold inline-flex items-center justify-center gap-1.5">{busy === b._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark done</button>
                    </div>
                  )}
                  {tab === "mine" && (b.status === "pending" || b.status === "confirmed") && (
                    <button onClick={() => { setAsk({ b, action: "cancel" }); setText(""); }} className="h-11 rounded-2xl bg-surface-secondary text-danger text-[15px] font-semibold">Cancel booking</button>
                  )}
                  {tab === "mine" && b.status === "completed" && b.other && (
                    <Link href={`/shop/${b.other.id}#reviews`} className="h-11 rounded-2xl bg-primary-soft text-primary-dark text-[15px] font-bold grid place-items-center">Rate {b.other.name}</Link>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {registers.length > 0 && (
          <section className="flex flex-col gap-3 mt-2">
            <div className="flex items-center justify-between print:hidden">
              <h2 className="text-[17px] font-extrabold text-content">Share lists</h2>
              <button onClick={() => window.print()} className="h-9 px-3.5 rounded-full bg-white ring-1 ring-card-border text-[14px] font-bold inline-flex items-center gap-1.5"><Printer className="h-4 w-4" /> Print</button>
            </div>
            {registers.map((r) => (
              <div key={r.ad.id} className="card p-4 print:shadow-none print:border print:border-black print:rounded-none">
                <p className="text-[15px] font-bold text-content">{r.ad.name}</p>
                <p className="text-[13.5px] text-content-tertiary">{r.day} · {r.rows.length} hissay confirmed</p>
                <ol className="mt-2 divide-y divide-card-border text-[15px]">
                  {r.rows.map((x, i) => (
                    <li key={i} className="py-2 flex justify-between gap-3"><span><b className="text-content-tertiary">{i + 1}.</b> {x.name || <span className="text-content-tertiary">name not given</span>}</span><span className="text-[13px] text-content-tertiary">{x.booker} · {x.code}</span></li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        )}

        {tab === "mine" && view === "open" && rows && rows.length > 0 && (
          <p className="text-center text-[13.5px] text-content-tertiary print:hidden">Pay in person, after the work or when you see the animal. Never send an advance.</p>
        )}
      </div>

      {ask && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-overlay animate-fade-in" onClick={() => setAsk(null)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col gap-3 animate-sheet-up">
            <span className="sm:hidden mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-surface-tertiary" />
            <h3 className="text-[18px] font-extrabold text-content">{ask.action === "confirm" ? "Confirm booking" : ask.action === "decline" ? "Decline booking" : "Cancel booking"}</h3>
            <p className="text-[14.5px] text-content-secondary">{what(ask.b)} · {ask.b.dayLabel}{ask.b.slotLabel ? ` · ${ask.b.slotLabel}` : ""}</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} autoFocus
              placeholder={ask.action === "confirm" ? "Optional note, e.g. “We'll come at 8:30 am.”" : "Reason (they'll see it), e.g. “Day 1 is full — I can do day 2.”"}
              className="w-full rounded-2xl bg-surface-secondary px-4 py-3 text-[15px] outline-none focus:bg-white focus:ring-2 focus:ring-primary/40 resize-none" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAsk(null)} className="h-12 rounded-2xl bg-surface-secondary text-[15px] font-bold text-content">Back</button>
              <button onClick={() => act(ask.b, ask.action, text)} disabled={busy === ask.b._id || (ask.action !== "confirm" && !text.trim())}
                className={`h-12 rounded-2xl text-white text-[15px] font-bold disabled:opacity-45 ${ask.action === "confirm" ? "bg-primary hover:bg-primary-dark" : "bg-danger hover:bg-red-700"}`}>
                {busy === ask.b._id ? <Loader2 className="h-4 w-4 animate-spin inline" /> : ask.action === "confirm" ? "Confirm" : ask.action === "decline" ? "Decline" : "Cancel booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Fact({ label, value, sub, wide }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`rounded-2xl bg-surface-secondary px-3.5 py-2.5 min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[12.5px] font-medium text-content-tertiary">{label}</dt>
      <dd className="text-[15px] font-semibold text-content leading-snug break-words">{value}</dd>
      {sub && <dd className="text-[13px] text-content-secondary mt-0.5">{sub}</dd>}
    </div>
  );
}

export default function BookingsPage() {
  return <Suspense fallback={<div className="py-24 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><BookingsInner /></Suspense>;
}
