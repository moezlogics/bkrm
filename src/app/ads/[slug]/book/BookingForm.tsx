"use client";

/**
 * The booking form. Service (qasai…): day → time → how many animals → where
 * → contact, with the estimate as you go. Share (hissa): how many shares →
 * the names → contact. A signed-out visitor's answers are kept while they
 * sign in. After sending: the booking code and what happens next.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clock, Loader2, MapPin, Minus, Plus, ShieldCheck, TriangleAlert, Users, BadgeCheck } from "lucide-react";
import { AppBar } from "@/components/layout/AppChrome";
import { PushNudge } from "@/components/push/PushNudge";
import { askForPush } from "@/lib/push-client";
import { loginUrl } from "@/lib/auth-intent";
import { shortDate, todayPk, addDays } from "@/lib/bookings/shared";

type Day = { key: string; label: string; date: string | null; pickDate: boolean; past: boolean; left: number | null; capacity: number | null };
type Unit = { key: string; label: string; rate: number | null };
type Props = {
  kind: "service" | "share";
  title: string;
  note: string;
  ad: { id: string; slug: string; name: string; price: number | null; image: string | null; place: string; provider: { name: string; verified: boolean } };
  days: Day[];
  eventDate: string | null;
  slots: { key: string; label: string }[];
  units: Unit[];
  shares: { available: number; total: number; max: number; namesLabel: string } | null;
  me: { signedIn: boolean; isOwner: boolean; name: string; phone: string; area: string };
};

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const DRAFT = (slug: string) => `booking_draft_${slug}`;

export function BookingForm({ kind, title, note, ad, days, eventDate, slots, units, shares, me }: Props) {
  const router = useRouter();
  const open = days.filter((d) => !d.past && d.left !== 0);
  const [day, setDay] = useState(open.length === 1 ? open[0].key : "");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(units.map((u, i) => [u.key, i === 0 ? 1 : 0])));
  const [nShares, setNShares] = useState(1);
  const [names, setNames] = useState<string[]>([]);
  const [contactName, setContactName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone);
  const [area, setArea] = useState(me.area);
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null);
  const [done, setDone] = useState<{ code: string } | null>(null);

  // Answers typed before signing in come back after it.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT(ad.slug));
      if (!raw) return;
      const d = JSON.parse(raw);
      sessionStorage.removeItem(DRAFT(ad.slug));
      if (d.day) setDay(d.day); if (d.date) setDate(d.date); if (d.slot) setSlot(d.slot);
      if (d.counts) setCounts(d.counts); if (d.nShares) setNShares(d.nShares); if (d.names) setNames(d.names);
      if (d.contactName && !me.name) setContactName(d.contactName); if (d.phone && !me.phone) setPhone(d.phone);
      if (d.area) setArea(d.area); if (d.address) setAddress(d.address); if (d.msg) setMsg(d.msg);
    } catch { /* ignore */ }
  }, [ad.slug, me.name, me.phone]);

  const chosen = days.find((d) => d.key === day) || null;
  const totalUnits = Object.values(counts).reduce((a, b) => a + b, 0);
  const left = chosen?.left ?? null;
  const est = useMemo(() => {
    if (kind === "share") return ad.price ? ad.price * nShares : null;
    let t = 0, priced = false;
    for (const u of units) if ((counts[u.key] || 0) > 0 && u.rate) { t += counts[u.key] * u.rate; priced = true; }
    return priced ? t : null;
  }, [kind, ad.price, nShares, units, counts]);

  const maxShares = shares ? Math.max(0, Math.min(shares.max, shares.available)) : 0;
  const full = kind === "service" ? open.length === 0 : maxShares === 0;
  const lastBefore = eventDate ? addDays(eventDate, -1) : "";

  const setCount = (k: string, delta: number) => setCounts((c) => {
    const next = Math.max(0, Math.min(50, (c[k] || 0) + delta));
    const others = Object.entries(c).filter(([x]) => x !== k).reduce((a, [, v]) => a + v, 0);
    if (left != null && delta > 0 && others + next > left) return c;
    return { ...c, [k]: next };
  });

  const submit = async () => {
    setErr(null);
    if (!me.signedIn) {
      try { sessionStorage.setItem(DRAFT(ad.slug), JSON.stringify({ day, date, slot, counts, nShares, names, contactName, phone, area, address, msg })); } catch { /* ignore */ }
      router.push(loginUrl(`/ads/${ad.slug}/book`));
      return;
    }
    if (kind === "service" && !day) { setErr({ field: "day", message: "Choose the day" }); return; }
    if (kind === "service" && chosen?.pickDate && !date) { setErr({ field: "date", message: "Choose the date" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: ad.id, day, date: chosen?.pickDate ? date : undefined, slot: slot || undefined,
          units: counts, shares: nShares, names, contactName, phone, area, address, note: msg,
        }),
      });
      const j = await r.json().catch(() => null);
      if (j?.success) { setDone({ code: j.data.code }); askForPush("booking"); window.scrollTo({ top: 0 }); }
      else setErr({ field: j?.field, message: j?.message || "It didn't go through — please try again" });
    } catch { setErr({ message: "We couldn't reach the server — check your connection" }); } finally { setBusy(false); }
  };

  const input = (bad: boolean) => `w-full h-12 rounded-xl border px-3.5 text-[15px] outline-none bg-surface ${bad ? "border-danger" : "border-card-border focus:border-primary"}`;
  const bad = (f: string) => err?.field === f;

  if (done) {
    return (
      <>
        <AppBar title="Booking sent" backHref={`/ads/${ad.slug}`} />
        <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <span className="mx-auto grid place-items-center h-14 w-14 rounded-full bg-emerald-600 text-white"><Check className="h-7 w-7" /></span>
            <h1 className="mt-3 text-xl font-bold text-slate-900">Booking sent</h1>
            <p className="mt-1 text-sm text-slate-700">Your booking number is <b className="font-mono">{done.code}</b>.</p>
          </div>
          <section className="rounded-2xl border border-card-border bg-card p-4">
            <h2 className="text-sm font-bold text-content mb-2">What happens next</h2>
            <ol className="flex flex-col gap-2 text-[13px] text-content-secondary">
              <li className="flex gap-2"><span className="font-bold text-primary">1.</span> {ad.provider.name} gets your request straight away and confirms or declines it.</li>
              <li className="flex gap-2"><span className="font-bold text-primary">2.</span> You get a notification and an email with the answer. Their number shows in your booking once confirmed.</li>
              <li className="flex gap-2"><span className="font-bold text-primary">3.</span> {kind === "share" ? "Pay the organiser directly when you see the animal or its video and weight." : "Pay in person when the work is done. Never send an advance."}</li>
            </ol>
          </section>
          <PushNudge context="booking" />
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/bookings" className="h-12 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold grid place-items-center">My bookings</Link>
            <Link href={`/ads/${ad.slug}`} className="h-12 rounded-xl border border-card-border bg-card text-content font-semibold grid place-items-center">Back to the ad</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar title={title} subtitle={ad.name} backHref={`/ads/${ad.slug}`} />
      <div className="max-w-lg mx-auto w-full px-4 py-4 pb-36 flex flex-col gap-5">
        {/* The ad */}
        <Link href={`/ads/${ad.slug}`} className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {ad.image ? <img src={ad.image} alt="" className="h-16 w-16 rounded-xl object-cover shrink-0" /> : <div className="h-16 w-16 rounded-xl bg-surface-secondary shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-content line-clamp-2">{ad.name}</p>
            <p className="text-[12px] text-content-secondary flex items-center gap-1 mt-0.5">{ad.provider.name}{ad.provider.verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified" />}</p>
            {ad.place && <p className="text-[11px] text-content-tertiary flex items-center gap-1"><MapPin className="h-3 w-3" /> {ad.place}</p>}
          </div>
        </Link>

        {me.isOwner && <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">This is your own ad — you'll see bookings for it in <Link href="/dashboard/bookings?tab=received" className="font-bold underline">My bookings</Link>.</p>}
        {full && <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">{kind === "share" ? "All shares on this animal are booked." : "Every day on this ad is fully booked."} Have a look at other ads in this section.</p>}

        {kind === "service" ? (
          <>
            <Step n={1} icon={CalendarDays} title="Which day?" error={bad("day") || bad("date") ? err!.message : ""}>
              <div className="grid grid-cols-2 gap-2">
                {days.map((d) => {
                  const off = d.past || d.left === 0;
                  const on = day === d.key;
                  return (
                    <button key={d.key} type="button" disabled={off} onClick={() => { setDay(d.key); setErr(null); }}
                      className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-45 ${on ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-card-border bg-card hover:border-primary/50"}`}>
                      <span className="block text-sm font-bold text-content">{d.label}</span>
                      <span className="block text-[12px] text-content-secondary">{d.pickDate ? "Pick a date" : d.date ? shortDate(d.date) : ""}</span>
                      <span className={`block text-[11px] font-semibold mt-1 ${d.past ? "text-content-tertiary" : d.left === 0 ? "text-danger" : d.left != null && d.left <= 3 ? "text-amber-600" : "text-emerald-600"}`}>
                        {d.past ? "Over" : d.left === 0 ? "Fully booked" : d.left != null ? `${d.left} of ${d.capacity} left` : "Open"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {chosen?.pickDate && (
                <input type="date" value={date} min={todayPk()} max={lastBefore || undefined} onChange={(e) => setDate(e.target.value)} className={`${input(bad("date"))} mt-2`} aria-label="Date" />
              )}
            </Step>

            {slots.length > 0 && (
              <Step n={2} icon={Clock} title="What time suits you?" hint="Optional — the provider confirms the exact time.">
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button key={s.key} type="button" onClick={() => setSlot(slot === s.key ? "" : s.key)}
                      className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold ${slot === s.key ? "border-primary bg-primary text-white" : "border-card-border bg-card text-content hover:border-primary"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </Step>
            )}

            <Step n={3} icon={Users} title="How many animals?" error={bad("units") ? err!.message : ""} hint={left != null ? `${left} can still be booked for ${chosen?.label}.` : undefined}>
              <div className="rounded-2xl border border-card-border bg-card divide-y divide-card-border">
                {units.map((u) => (
                  <div key={u.key} className="flex items-center gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-content">{u.label}</p>
                      <p className="text-[12px] text-content-secondary">{u.rate ? `${rs(u.rate)} each` : "Price on confirmation"}</p>
                    </div>
                    <Stepper value={counts[u.key] || 0} onMinus={() => setCount(u.key, -1)} onPlus={() => setCount(u.key, 1)} label={u.label} />
                  </div>
                ))}
              </div>
            </Step>

            <Step n={4} icon={MapPin} title="Where?" error={bad("address") ? err!.message : ""}>
              <input value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder="Area, e.g. Johar Town" className={input(false)} aria-label="Area" />
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} rows={2} placeholder="House / street, and a landmark"
                className={`w-full mt-2 rounded-xl border px-3.5 py-3 text-[15px] outline-none bg-surface ${bad("address") ? "border-danger" : "border-card-border focus:border-primary"}`} aria-label="Address" />
            </Step>
          </>
        ) : shares && (
          <>
            <Step n={1} icon={Users} title="How many hissay?" error={bad("shares") ? err!.message : ""} hint={`${shares.available} of ${shares.total} free${ad.price ? ` · ${rs(ad.price)} each` : ""}`}>
              <div className="flex items-center justify-between rounded-2xl border border-card-border bg-card px-3.5 py-3">
                <span className="text-sm font-semibold text-content">{nShares === 1 ? "1 hissa" : `${nShares} hissay`}</span>
                <Stepper value={nShares} onMinus={() => setNShares((v) => Math.max(1, v - 1))} onPlus={() => setNShares((v) => Math.min(maxShares || 1, v + 1))} label="Shares" />
              </div>
            </Step>
            <Step n={2} icon={ShieldCheck} title={shares.namesLabel} hint="Optional now — you can tell the organiser later.">
              <div className="flex flex-col gap-2">
                {Array.from({ length: nShares }).map((_, i) => (
                  <input key={i} value={names[i] || ""} maxLength={60} onChange={(e) => setNames((x) => { const y = [...x]; y[i] = e.target.value; return y; })}
                    placeholder={`Hissa ${i + 1} — name`} className={input(false)} aria-label={`Name for hissa ${i + 1}`} />
                ))}
              </div>
            </Step>
            <Step n={3} icon={MapPin} title="Address for the meat (optional)">
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} rows={2} placeholder="If the meat is delivered: house, street, area"
                className="w-full rounded-xl border border-card-border px-3.5 py-3 text-[15px] outline-none bg-surface focus:border-primary" aria-label="Address" />
            </Step>
          </>
        )}

        <Step n={kind === "service" ? 5 : 4} icon={ShieldCheck} title="Your details" error={bad("contactName") || bad("phone") ? err!.message : ""}>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Your name" className={input(bad("contactName"))} aria-label="Your name" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="03XX XXXXXXX" className={`${input(bad("phone"))} mt-2`} aria-label="Mobile number" />
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} rows={2} placeholder="Anything they should know (optional)"
            className="w-full mt-2 rounded-xl border border-card-border px-3.5 py-3 text-sm outline-none bg-surface focus:border-primary" aria-label="Note" />
          <p className="mt-1 text-[11px] text-content-tertiary">Only {ad.provider.name} sees your number, to arrange the booking.</p>
        </Step>

        {note && <p className="flex items-start gap-2 rounded-xl bg-surface-secondary px-3 py-2.5 text-[12px] text-content-secondary"><ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-px" /> {note}</p>}
        {err && !["day", "date", "units", "address", "contactName", "phone", "shares"].includes(err.field || "") && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"><TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" /> {err.message}</p>
        )}
      </div>

      {/* Sticky total + send */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-card-border px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-content-tertiary">{kind === "share" ? (nShares === 1 ? "1 hissa" : `${nShares} hissay`) : totalUnits ? `${totalUnits} ${totalUnits === 1 ? "animal" : "animals"}` : "Nothing added"}{chosen ? ` · ${chosen.label}` : ""}</p>
            <p className="text-lg font-bold text-content leading-tight">{est != null ? rs(est) : "Price on confirmation"}</p>
            {est != null && <p className="text-[10px] text-content-tertiary">Estimate — paid in person</p>}
          </div>
          <button onClick={submit} disabled={busy || full || me.isOwner || (kind === "service" && !totalUnits)}
            className="shrink-0 h-12 px-5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold inline-flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : me.signedIn ? "Send booking" : "Sign in to book"}
          </button>
        </div>
      </div>
    </>
  );
}

function Step({ n, icon: Icon, title, hint, error, children }: { n: number; icon: React.ElementType; title: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className="grid place-items-center h-6 w-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">{n}</span>
        <Icon className="h-4 w-4 text-content-tertiary" />
        <h2 className="text-sm font-bold text-content">{title}</h2>
      </div>
      {children}
      {error ? <p className="mt-1.5 text-[12px] text-danger">{error}</p> : hint ? <p className="mt-1.5 text-[11px] text-content-tertiary">{hint}</p> : null}
    </section>
  );
}

function Stepper({ value, onMinus, onPlus, label }: { value: number; onMinus: () => void; onPlus: () => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button type="button" onClick={onMinus} aria-label={`Fewer: ${label}`} className="grid place-items-center h-9 w-9 rounded-full border border-card-border text-content hover:border-primary disabled:opacity-40" disabled={value <= 0}><Minus className="h-4 w-4" /></button>
      <span className="w-7 text-center text-base font-bold tabular-nums text-content" aria-live="polite">{value}</span>
      <button type="button" onClick={onPlus} aria-label={`More: ${label}`} className="grid place-items-center h-9 w-9 rounded-full bg-primary text-white hover:bg-primary-dark"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
