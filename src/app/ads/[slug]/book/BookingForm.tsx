"use client";

/**
 * The booking screen. Service (qasai…): day → time → animals → address →
 * contact, with the total as you go. Share (hissa): how many shares → the
 * names → contact. A signed-out visitor's answers are kept while they sign
 * in. After sending: the booking number and what happens next.
 */
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, MapPin, Minus, Plus, TriangleAlert, BadgeCheck, Copy, CalendarDays } from "lucide-react";
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
/** "Early — right after Eid prayer" → ["Early", "right after Eid prayer"]; "Morning (9 am – 12 pm)" → ["Morning", "9 am – 12 pm"]. */
const splitLabel = (s: string): [string, string] => {
  const m = s.match(/^(.*?)\s*(?:—\s*(.*)|\((.*)\))$/);
  return m ? [m[1], (m[2] || m[3] || "").trim()] : [s, ""];
};
const field = "w-full h-12 rounded-2xl bg-surface-secondary px-4 text-[15px] text-content placeholder:text-content-tertiary outline-none ring-1 ring-transparent focus:bg-white focus:ring-2 focus:ring-primary/40 transition";

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
  const [copied, setCopied] = useState(false);

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
    if (kind === "service" && !day) { setErr({ field: "day", message: "Choose a day" }); document.getElementById("bk-day")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (kind === "service" && chosen?.pickDate && !date) { setErr({ field: "date", message: "Choose the date" }); return; }
    if (kind === "share") {
      const missing = Array.from({ length: nShares }).some((_, i) => (names[i] || "").trim().length < 2);
      if (missing) {
        setErr({ field: "names", message: nShares === 1 ? "Please enter the name for the hissa" : "Please enter a name for each hissa" });
        document.getElementById("bk-names")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
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

  const bad = (f: string) => err?.field === f;
  const errorFor = (...f: string[]) => (err && f.includes(err.field || "") ? err.message : "");

  // ── Sent ────────────────────────────────────────────────────────────────
  if (done) {
    const steps = [
      `${ad.provider.name} gets your request now and confirms it.`,
      "You get a notification with the answer; their number shows in your booking once confirmed.",
      kind === "share" ? "Pay the organiser directly when you see the animal or its video." : "Pay in person after the work is done — never an advance.",
    ];
    return (
      <>
        <AppBar title="Booking sent" backHref={`/ads/${ad.slug}`} />
        <div className="max-w-lg mx-auto w-full px-4 pt-8 pb-10 flex flex-col gap-5">
          <div className="text-center">
            <span className="mx-auto grid place-items-center h-20 w-20 rounded-full bg-primary-soft">
              <span className="grid place-items-center h-14 w-14 rounded-full bg-primary text-white"><Check className="h-7 w-7 stroke-[3]" /></span>
            </span>
            <h1 className="mt-5 text-[24px] font-extrabold tracking-tight text-content">Request sent</h1>
            <p className="mt-1 text-[14.5px] text-content-secondary">We&apos;ll let you know as soon as {ad.provider.name} replies.</p>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(done.code).then(() => setCopied(true)).catch(() => { }); }}
              className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-full bg-surface-secondary text-[15px] font-semibold text-content">
              Booking no. <span className="font-mono font-bold">{done.code}</span>
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-content-tertiary" />}
            </button>
          </div>

          <section className="card p-5">
            <h2 className="text-[15px] font-bold text-content">What happens next</h2>
            <ol className="mt-3 flex flex-col gap-3.5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-[15px] text-content-secondary leading-snug">
                  <span className="grid place-items-center h-6 w-6 rounded-full bg-primary-soft text-primary-dark text-[13px] font-bold shrink-0">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </section>

          <PushNudge context="booking" />

          <div className="grid grid-cols-2 gap-2.5">
            <Link href="/dashboard/bookings" className="h-11 sm:h-12 px-4 rounded-xl sm:rounded-2xl bg-primary hover:bg-primary-dark text-white text-[14px] sm:text-[15px] font-bold leading-none whitespace-nowrap inline-flex items-center justify-center">My bookings</Link>
            <Link href={`/ads/${ad.slug}`} className="h-11 sm:h-12 px-4 rounded-xl sm:rounded-2xl bg-surface-secondary text-content text-[14px] sm:text-[15px] font-bold leading-none whitespace-nowrap inline-flex items-center justify-center">Back to ad</Link>
          </div>
        </div>
      </>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  const canSend = !(busy || full || me.isOwner || (kind === "service" && !totalUnits));

  return (
    <>
      <AppBar title={title} backHref={`/ads/${ad.slug}`} />
      <div className="max-w-lg mx-auto w-full px-4 pt-4 pb-40 flex flex-col gap-3">

        {/* Who you're booking */}
        {kind === "share" ? (
          <Link href={`/ads/${ad.slug}`} className="card overflow-hidden block">
            {ad.image && (
              <span className="relative block aspect-[16/9] bg-surface-tertiary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ad.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              </span>
            )}
            <span className="block p-4">
              <span className="block text-[16px] font-bold text-content leading-snug line-clamp-2">{ad.name}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[14px] text-content-secondary">
                {ad.provider.name}{ad.provider.verified && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Verified" />}
                {ad.place && <><span className="text-content-tertiary">·</span><MapPin className="h-3.5 w-3.5" />{ad.place}</>}
              </span>
              {shares && <ShareMeter total={shares.total} free={shares.available} />}
            </span>
          </Link>
        ) : (
          <Link href={`/ads/${ad.slug}`} className="card flex items-center gap-3.5 p-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ad.image ? <img src={ad.image} alt="" className="h-16 w-16 rounded-2xl object-cover shrink-0" /> : <span className="h-16 w-16 rounded-2xl bg-surface-secondary shrink-0" />}
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[15.5px] font-bold text-content">
                <span className="truncate">{ad.provider.name}</span>{ad.provider.verified && <BadgeCheck className="h-4 w-4 text-primary shrink-0" aria-label="Verified" />}
              </span>
              <span className="block text-[14px] text-content-secondary line-clamp-1 mt-0.5">{ad.name}</span>
              {ad.place && <span className="mt-0.5 flex items-center gap-1 text-[13px] text-content-tertiary"><MapPin className="h-3 w-3" /> {ad.place}</span>}
            </span>
          </Link>
        )}

        {me.isOwner && <Notice>This is your own ad — bookings for it show in <Link href="/dashboard/bookings?tab=received" className="font-bold underline">My bookings</Link>.</Notice>}
        {full && <Notice>{kind === "share" ? "All shares on this animal are booked." : "Every day on this ad is fully booked."} Have a look at other ads in this section.</Notice>}

        {kind === "service" ? (
          <>
            <Section id="bk-day" title="Day" error={errorFor("day", "date")}>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar snap-x scroll-px-0">
                {days.map((d) => {
                  const off = d.past || d.left === 0;
                  const on = day === d.key;
                  const status = d.past ? "Over" : d.left === 0 ? "Full" : d.left != null ? `${d.left} left` : "Open";
                  return (
                    <button key={d.key} type="button" disabled={off} onClick={() => { setDay(d.key); setErr(null); }} aria-pressed={on}
                        className={`snap-start shrink-0 min-w-[112px] rounded-2xl px-3.5 py-2.5 text-left transition-colors disabled:opacity-40 ${on ? "bg-primary text-white" : "bg-surface-secondary text-content active:bg-surface-tertiary"}`}>
                        <span className={`block text-[12px] font-semibold whitespace-nowrap ${on ? "text-white/75" : "text-content-tertiary"}`}>{d.pickDate ? "Pick a date" : d.date ? shortDate(d.date) : ""}</span>
                        <span className="block mt-0.5 text-[14px] font-bold leading-tight whitespace-nowrap">{d.label}</span>
                        <span className={`mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold whitespace-nowrap ${on ? "text-white" : d.left === 0 ? "text-danger" : d.left != null && d.left <= 3 ? "text-amber-600" : "text-primary"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-white" : d.left === 0 || d.past ? "bg-content-tertiary" : d.left != null && d.left <= 3 ? "bg-amber-500" : "bg-primary"}`} />{status}
                        </span>
                    </button>
                  );
                })}
              </div>
              {chosen?.pickDate && (
                <label className="mt-2.5 flex items-center gap-3 h-12 rounded-2xl bg-surface-secondary px-4 focus-within:ring-2 focus-within:ring-primary/40">
                  <CalendarDays className="h-[18px] w-[18px] text-content-tertiary" />
                  <input type="date" value={date} min={todayPk()} max={lastBefore || undefined} onChange={(e) => setDate(e.target.value)} className="flex-1 bg-transparent outline-none text-[15px]" aria-label="Date" />
                </label>
              )}
              {left != null && chosen && <p className="mt-2 text-[13.5px] text-content-tertiary">{left} {left === 1 ? "animal" : "animals"} can still be booked for {chosen.label}.</p>}
            </Section>

            {slots.length > 0 && (
              <Section title="Time" aside="Optional">
                <div className="grid grid-cols-2 gap-2">
                  {slots.map((s) => {
                    const [main, sub] = splitLabel(s.label);
                    const on = slot === s.key;
                    return (
                      <button key={s.key} type="button" onClick={() => setSlot(on ? "" : s.key)} aria-pressed={on}
                        className={`rounded-2xl px-3.5 py-3 text-left transition-colors ${on ? "bg-primary text-white" : "bg-surface-secondary text-content active:bg-surface-tertiary"}`}>
                        <span className="block text-[15px] font-bold leading-tight">{main}</span>
                        {sub && <span className={`block mt-0.5 text-[12.5px] leading-snug ${on ? "text-white/80" : "text-content-tertiary"}`}>{sub}</span>}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section title="Animals" error={errorFor("units")}>
              <div className="flex flex-col divide-y divide-card-border">
                {units.map((u) => (
                  <div key={u.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-content">{u.label}</p>
                      <p className="text-[13.5px] text-content-tertiary">{u.rate ? `${rs(u.rate)} each` : "Price on confirmation"}</p>
                    </div>
                    <Stepper value={counts[u.key] || 0} min={0} onMinus={() => setCount(u.key, -1)} onPlus={() => setCount(u.key, 1)} label={u.label} />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Address" error={errorFor("address")}>
              <input value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} placeholder="Area, e.g. Johar Town" className={field} aria-label="Area" />
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} rows={2} placeholder="House, street and a landmark"
                className={`${field} h-auto py-3 mt-2 resize-none ${bad("address") ? "!ring-2 !ring-danger/50" : ""}`} aria-label="Address" />
            </Section>
          </>
        ) : shares && (
          <>
            <Section title="Shares" error={errorFor("shares")}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-content">{nShares === 1 ? "1 hissa" : `${nShares} hissay`}</p>
                  <p className="text-[13.5px] text-content-tertiary">{ad.price ? `${rs(ad.price)} each · ` : ""}up to {maxShares || 1}</p>
                </div>
                <Stepper value={nShares} min={1} onMinus={() => setNShares((v) => Math.max(1, v - 1))} onPlus={() => setNShares((v) => Math.min(maxShares || 1, v + 1))} label="Shares" />
              </div>
            </Section>

            <Section id="bk-names" title={shares.namesLabel} error={errorFor("names")}>
              <div className="flex flex-col gap-2">
                {Array.from({ length: nShares }).map((_, i) => (
                  <input key={i} value={names[i] || ""} maxLength={60} onChange={(e) => { setNames((x) => { const y = [...x]; y[i] = e.target.value; return y; }); if (err?.field === "names") setErr(null); }}
                    placeholder={`Hissa ${i + 1} — name`} className={`${field} ${bad("names") && (names[i] || "").trim().length < 2 ? "!ring-2 !ring-danger/50" : ""}`} aria-label={`Name for hissa ${i + 1}`} />
                ))}
              </div>
            </Section>

            <Section title="Meat delivery address" aside="Optional">
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} rows={2} placeholder="House, street, area"
                className={`${field} h-auto py-3 resize-none`} aria-label="Address" />
            </Section>
          </>
        )}

        <Section title="Your details" error={errorFor("contactName", "phone")}>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Your name"
            className={`${field} ${bad("contactName") ? "!ring-2 !ring-danger/50" : ""}`} aria-label="Your name" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="Mobile number, 03XX XXXXXXX"
            className={`${field} mt-2 ${bad("phone") ? "!ring-2 !ring-danger/50" : ""}`} aria-label="Mobile number" />
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} rows={2} placeholder="Anything they should know (optional)"
            className={`${field} h-auto py-3 mt-2 resize-none text-[15px]`} aria-label="Note" />
          <p className="mt-2 text-[13px] text-content-tertiary">Only {ad.provider.name} sees your number.</p>
        </Section>

        {note && <p className="px-1 text-[13.5px] text-content-tertiary leading-relaxed">{note}</p>}
        {err && !["day", "date", "units", "address", "contactName", "phone", "shares", "names"].includes(err.field || "") && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-light px-4 py-3 text-[15px] text-danger"><TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" /> {err.message}</p>
        )}
      </div>

      {/* Total + send */}
          <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-card-border px-4 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))]">
            <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] sm:text-[13px] font-medium text-content-tertiary truncate">
                    {kind === "share" ? (nShares === 1 ? "1 hissa" : `${nShares} hissay`) : totalUnits ? `${totalUnits} ${totalUnits === 1 ? "animal" : "animals"}` : "No animals added"}{chosen ? ` · ${chosen.label}` : ""}
                  </p>
                  <p className="text-[18px] sm:text-[20px] font-extrabold tracking-tight text-content leading-tight truncate">{est != null ? rs(est) : "On confirmation"}</p>
              </div>
              <button onClick={submit} disabled={!canSend}
              className="shrink-0 h-11 sm:h-12 px-5 sm:px-6 rounded-xl sm:rounded-2xl bg-primary hover:bg-primary-dark text-white text-[14px] sm:text-[15px] font-bold leading-none whitespace-nowrap inline-flex items-center justify-center gap-2 disabled:opacity-45 transition-colors">
                {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : me.signedIn ? "Send request" : "Log in to book"}
              </button>
            </div>
          </div>
        </>
        );
}

        function Section({id, title, aside, error, children}: {id ?: string; title: string; aside?: string; error?: string; children: React.ReactNode }) {
  return (
        <section id={id} className="card p-4">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h2 className="text-[16px] font-bold text-content">{title}</h2>
            {aside && <span className="text-[13px] font-medium text-content-tertiary">{aside}</span>}
          </div>
          {children}
          {error && <p className="mt-2.5 text-[14px] font-medium text-danger">{error}</p>}
        </section>
        );
}

        function Notice({children}: {children: React.ReactNode }) {
  return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[15px] text-amber-950">{children}</p>;
}

        /** Seven slots for an animal's shares: filled = taken, outlined = free. */
        function ShareMeter({total, free}: {total: number; free: number }) {
  const taken = Math.max(0, total - free);
        return (
        <span className="mt-3.5 block">
          <span className="flex gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${i < taken ? "bg-primary" : "bg-surface-tertiary"}`} />
            ))}
          </span>
          <span className="mt-2 flex justify-between text-[13.5px] font-semibold">
            <span className="text-content">{free} of {total} shares free</span>
            <span className="text-content-tertiary">{taken} booked</span>
          </span>
        </span>
        );
}

        function Stepper({value, min, onMinus, onPlus, label}: {value: number; min: number; onMinus: () => void; onPlus: () => void; label: string }) {
  return (
        <div className="flex items-center gap-1 shrink-0 rounded-full bg-surface-secondary p-1">
          <button type="button" onClick={onMinus} aria-label={`Fewer: ${label}`} disabled={value <= min}
            className="grid place-items-center h-9 w-9 rounded-full bg-white text-content shadow-sm disabled:opacity-35 disabled:shadow-none active:scale-90 transition-transform"><Minus className="h-4 w-4" /></button>
          <span className="w-8 text-center text-[16px] font-bold tabular-nums text-content" aria-live="polite">{value}</span>
          <button type="button" onClick={onPlus} aria-label={`More: ${label}`}
            className="grid place-items-center h-9 w-9 rounded-full bg-primary text-white active:scale-90 transition-transform"><Plus className="h-4 w-4" /></button>
        </div>
        );
}
