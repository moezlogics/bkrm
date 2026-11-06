"use client";

/**
 * Plans & boosts — buying a plan in one tap, Pakistani style:
 *   1. the seller sees their plan and usage, and anything still open
 *      (unpaid, being checked, not verified) at the top;
 *   2. "Get plan" opens the checkout straight away — the exact amount, the
 *      accounts to send it to (copy buttons), which one they used, and the
 *      screenshot;
 *   3. the admin checks it; the seller gets a notification and an email.
 * With no payment accounts set up yet, the checkout offers WhatsApp to the
 * support number instead of a dead end.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Loader2, Check, Crown, X, Upload, Copy, Clock, CheckCircle2, XCircle, FileText, Rocket, TriangleAlert, MessageCircle,
  Smartphone, Landmark, Sparkles, RefreshCw,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { AppBar } from "@/components/layout/AppChrome";
import { askForPush } from "@/lib/push-client";
import { PushNudge } from "@/components/push/PushNudge";

type Plan = { _id: string; name: string; price: number; finalPrice: number; durationDays: number; listingLimit: number; featuredLimit: number; featuredDurationDays: number; description?: string; features: string[]; isPopular: boolean };
type PM = { type: string; title: string; account: string; name?: string; instructions?: string };
type Invoice = { _id: string; invoiceNumber: string; planName: string; amount: number; status: string; rejectionReason?: string; createdAt: string; packageId?: string };
type Me = {
  plan: { isFree: boolean; planName: string; listingLimit: number; listingsUsed: number; featuredLimit: number; featuredUsed: number; endDate: string | null };
  open: Invoice | null; hasPaymentMethods: boolean; support: string;
};

const ST: Record<string, { label: string; cls: string; icon: any }> = {
  awaiting_payment: { label: "Not paid yet", cls: "bg-amber-50 text-amber-700", icon: Clock },
  submitted: { label: "Being checked", cls: "bg-blue-50 text-blue-700", icon: Clock },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Not verified", cls: "bg-red-50 text-red-600", icon: XCircle },
};
const rs = (n: number) => `Rs ${Math.round(n || 0).toLocaleString("en-US")}`;
const pct = (u: number, l: number) => (l > 0 ? Math.min(100, Math.round((u / l) * 100)) : 0);
const waLink = (phone: string, text: string) => {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = `92${d.slice(1)}`;
  return d.length >= 10 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : "";
};

export default function PlansPage() {
  const { status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{ invoice: any; paymentMethods: PM[] } | null>(null);
  // Sent here from "Post an ad" with no listing slot left, or from a boost offer.
  const [limitHit, setLimitHit] = useState<{ max: number; free: boolean } | null>(null);
  const [fromBoost, setFromBoost] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("reason") === "limit") setLimitHit({ max: Number(q.get("max")) || 0, free: q.get("free") !== "0" });
    if (q.get("ad")) setFromBoost(true);
  }, []);

  useEffect(() => { if (status === "unauthenticated") router.push("/login?callbackUrl=/dashboard/plans"); }, [status, router]);

  const load = useCallback(async () => {
    const [p, i] = await Promise.all([
      fetch("/api/plans", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/invoices", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    if (p?.success) { setPlans(p.data); setMe(p.me || null); }
    if (i?.success) setInvoices(i.data);
  }, []);
  useEffect(() => {
    if (status !== "authenticated") return;
    load().finally(() => setLoading(false));
  }, [status, load]);

  const buy = async (packageId: string) => {
    setBuying(packageId);
    setNotice(null);
    try {
      const r = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId }) });
      const j = await r.json();
      if (j.success) { setCheckout(j.data); void load(); }
      else setNotice(j.message || "Couldn't open the checkout — please try again.");
    } catch { setNotice("We couldn't reach the server. Check your connection and try again."); } finally { setBuying(null); }
  };

  const openInvoice = async (id: string) => {
    const r = await fetch(`/api/invoices/${id}`); const j = await r.json().catch(() => null);
    if (j?.success) setCheckout(j.data); else toast.error(j?.message || "Couldn't open it");
  };

  if (loading || status === "loading") return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const cur = me?.plan;
  const open = me?.open || null;
  const canPay = !!me?.hasPaymentMethods;

  return (
    <>
    <AppBar title="Plans & boosts" backHref="/dashboard" />
    <div className="max-w-4xl w-full mx-auto px-4 py-4 pb-10 flex flex-col gap-4">
      {limitHit && (
        <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="font-bold text-sm">{!limitHit.free ? "You've used all the listings on your plan" : limitHit.max > 1 ? `Your ${limitHit.max} free ads are all live` : "Your free ad is already live"}</p>
          <p className="text-[13px] mt-1 leading-relaxed">
            {limitHit.free
              ? `A free account can have ${limitHit.max > 1 ? `${limitHit.max} live ads` : "one live ad"} at a time. Choose a plan below to post more — or mark your current ad as sold to post a new one for free.`
              : "Upgrade to a bigger plan below, or mark an ad as sold to free a slot."}
          </p>
          <Link href="/dashboard/seller" className="mt-2 inline-flex text-xs font-bold text-amber-950 underline underline-offset-2">Manage my ads →</Link>
        </div>
      )}
      {fromBoost && !limitHit && (
        <div role="status" className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <p className="font-bold text-sm text-content flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Featured ads reach many more buyers</p>
          <p className="text-[13px] mt-1 text-content-secondary leading-relaxed">They&apos;re shown first in search and on the home page. Pick a plan with featured ads, then tap <b>Boost</b> on your ad in My ads.</p>
        </div>
      )}

      {/* What's still open — the one thing that matters on this page. */}
      {open?.status === "submitted" && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <p className="font-bold text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Your payment is being checked</p>
          <p className="text-[13px] mt-1 leading-relaxed">{open.invoiceNumber} · {open.planName} · {rs(open.amount)}. Your plan starts as soon as our team verifies it — usually the same day. You&apos;ll get a notification.</p>
        </div>
      )}
      {open && open.status !== "submitted" && (
        <div className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${open.status === "rejected" ? "border-red-200 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">{open.status === "rejected" ? "We couldn't verify your payment" : "Payment not finished"}</p>
            <p className="text-[13px] mt-0.5 leading-relaxed">
              {open.invoiceNumber} · {open.planName} · {rs(open.amount)}
              {open.status === "rejected" && open.rejectionReason ? ` — ${open.rejectionReason}` : ""}
            </p>
          </div>
          <button onClick={() => openInvoice(open._id)} className={`shrink-0 h-10 px-4 rounded-xl text-white text-sm font-bold ${open.status === "rejected" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>
            {open.status === "rejected" ? "Send again" : "Complete payment"}
          </button>
        </div>
      )}
      {notice && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-2">
          <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> <span>{notice}</span>
        </div>
      )}

      {/* Your plan */}
      {cur && (
        <section className={`rounded-2xl p-4 ${cur.isFree ? "border border-card-border bg-card" : "bg-gradient-to-br from-primary to-primary-dark text-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${cur.isFree ? "text-content-tertiary" : "text-white/75"}`}>Your plan</p>
              <h2 className={`text-xl font-bold leading-tight mt-0.5 ${cur.isFree ? "text-content" : "text-white"}`}>{cur.isFree ? "Free" : cur.planName}</h2>
              <p className={`text-[12px] mt-0.5 ${cur.isFree ? "text-content-secondary" : "text-white/80"}`} suppressHydrationWarning>
                {cur.isFree ? "Included with every account — no payment." : cur.endDate ? `Active until ${formatDate(cur.endDate)}` : "Active"}
              </p>
            </div>
            <Crown className={`h-6 w-6 shrink-0 ${cur.isFree ? "text-content-tertiary" : "text-amber-300"}`} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Meter label="Live ads" used={cur.listingsUsed} limit={cur.listingLimit} light={!cur.isFree} />
            <Meter label="Featured" used={cur.featuredUsed} limit={cur.featuredLimit} light={!cur.isFree} none="Not on the free plan" />
          </div>
          {!cur.isFree && cur.featuredLimit > cur.featuredUsed && (
            <Link href="/dashboard/seller" className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[13px] font-semibold"><Rocket className="h-4 w-4" /> Boost an ad now</Link>
          )}
        </section>
      )}

      <div>
        <h2 className="text-base font-bold text-content">Choose a plan</h2>
        <p className="text-[13px] text-content-secondary mt-0.5">More live ads, and featured ads shown first to buyers. Pay by JazzCash, Easypaisa or bank — your plan starts when the payment is checked.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((p) => {
          const mine = !!cur && !cur.isFree && cur.planName.toLowerCase() === p.name.toLowerCase();
          return (
            <div key={p._id} className={`relative rounded-2xl border bg-card p-4 flex flex-col ${mine ? "border-emerald-400 shadow-md" : p.isPopular ? "border-primary shadow-md" : "border-card-border"}`}>
              {mine ? <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">YOUR PLAN</span>
                : p.isPopular && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">MOST POPULAR</span>}
              <div className="flex items-center gap-2"><Crown className={`h-5 w-5 ${p.isPopular ? "text-amber-500" : "text-content-tertiary"}`} /><h3 className="font-bold text-content">{p.name}</h3></div>
              {p.description && <p className="text-[12px] text-content-secondary mt-1">{p.description}</p>}
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-content">{rs(p.finalPrice)}</span>
                {p.price > p.finalPrice && <span className="text-xs text-content-tertiary line-through">{rs(p.price)}</span>}
                <span className="text-xs text-content-secondary">/ {p.durationDays} days</span>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5 flex-1">
                <li className="flex items-start gap-1.5 text-[13px] text-content"><Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {p.listingLimit} live ads at a time</li>
                {p.featuredLimit > 0 && <li className="flex items-start gap-1.5 text-[13px] text-content"><Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {p.featuredLimit} featured {p.featuredLimit === 1 ? "ad" : "ads"} for {p.featuredDurationDays} days each</li>}
                {p.features.filter((f) => !/live ads|featured|validity|days validity/i.test(f)).map((f) => <li key={f} className="flex items-start gap-1.5 text-[13px] text-content-secondary"><Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> {f}</li>)}
              </ul>
              <button
                onClick={() => buy(p._id)}
                disabled={buying === p._id || open?.status === "submitted"}
                className={`mt-4 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${p.isPopular || mine ? "bg-primary hover:bg-primary-dark text-white" : "border border-primary text-primary hover:bg-primary/5"}`}
              >
                {buying === p._id ? <Loader2 className="h-5 w-5 animate-spin" /> : mine ? <><RefreshCw className="h-4 w-4" /> Renew</> : "Get plan"}
              </button>
            </div>
          );
        })}
      </div>
      {plans.length === 0 && <p className="text-sm text-content-secondary">No plans are on offer right now. Please check back later.</p>}

      {/* Invoice history */}
      {invoices.length > 0 && (
        <section className="mt-2">
          <h2 className="text-base font-bold text-content mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Your payments</h2>
          <div className="flex flex-col gap-2">
            {invoices.map((iv) => {
              const s = ST[iv.status] || ST.awaiting_payment;
              return (
                <div key={iv._id} className="rounded-xl border border-card-border bg-card p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-content">{iv.invoiceNumber}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.cls}`}><s.icon className="h-3 w-3" /> {s.label}</span>
                    </div>
                    <p className="text-[11px] text-content-secondary">{iv.planName} · {rs(iv.amount)} · <span suppressHydrationWarning>{formatDate(iv.createdAt)}</span></p>
                    {iv.status === "rejected" && iv.rejectionReason && <p className="text-[11px] text-red-600">Reason: {iv.rejectionReason}</p>}
                  </div>
                  {(iv.status === "awaiting_payment" || iv.status === "rejected") && (
                    <button onClick={() => openInvoice(iv._id)} className="shrink-0 text-xs font-bold text-primary hover:underline">{iv.status === "rejected" ? "Send again →" : "Pay now →"}</button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {checkout && (
        <Checkout
          data={checkout}
          canPay={canPay}
          support={me?.support || ""}
          onClose={() => setCheckout(null)}
          onDone={() => { void load(); }}
        />
      )}
    </div>
    </>
  );
}

function Meter({ label, used, limit, light, none }: { label: string; used: number; limit: number; light: boolean; none?: string }) {
  const full = limit > 0 && used >= limit;
  return (
    <div>
      <div className={`flex items-baseline justify-between text-[12px] ${light ? "text-white/85" : "text-content-secondary"}`}>
        <span>{label}</span>
        <span className={`font-bold tabular-nums ${light ? "text-white" : "text-content"}`}>{limit > 0 ? `${used} / ${limit}` : "—"}</span>
      </div>
      <div className={`mt-1.5 h-2 rounded-full overflow-hidden ${light ? "bg-white/20" : "bg-surface-secondary"}`}>
        <div className={`h-full rounded-full ${light ? "bg-white" : full ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct(used, limit)}%` }} />
      </div>
      {limit === 0 && none && <p className={`text-[11px] mt-1 ${light ? "text-white/70" : "text-content-tertiary"}`}>{none}</p>}
      {full && <p className={`text-[11px] mt-1 ${light ? "text-white/85" : "text-amber-700"}`}>All used</p>}
    </div>
  );
}

const TYPE_ICON = (t: string) => (/jazz|easy|sada|upaisa|nayapay/i.test(t) ? Smartphone : Landmark);

function Checkout({ data, canPay, support, onClose, onDone }: { data: { invoice: any; paymentMethods: PM[] }; canPay: boolean; support: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const inv = data.invoice;
  const methods = data.paymentMethods;
  const [method, setMethod] = useState(methods[0]?.title || "");
  const [note, setNote] = useState("");
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("image", file); fd.append("folder", "payments"); fd.append("context", `Payment ${inv.invoiceNumber}`);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      if (j?.success && j.data?.url) setShot(j.data.url); else setErr(j?.message || "The screenshot didn't upload — please try again.");
    } catch { setErr("The screenshot didn't upload — check your connection and try again."); } finally { setUploading(false); }
  };
  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast.success("Copied"); } catch { toast.error("Couldn't copy — select it and copy by hand"); }
  };

  const submit = async () => {
    if (!shot) { setErr("Please upload the payment screenshot."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/invoices/${inv._id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentScreenshot: shot, paymentMethod: method, transactionNote: note }) });
      const j = await r.json().catch(() => null);
      if (j?.success) { setDone(true); onDone(); askForPush("payment"); }
      else setErr(j?.message || "It didn't go through — please try again.");
    } catch { setErr("We couldn't reach the server — please try again."); } finally { setBusy(false); }
  };

  const wa = waLink(support, `Assalam o Alaikum, I want to buy the ${inv.planName} plan (${rs(inv.amount)}). Invoice ${inv.invoiceNumber}. How can I pay?`);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={() => !busy && onClose()} />
      <div role="dialog" aria-modal="true" aria-label={`Pay ${rs(inv.amount)}`} className="relative z-10 w-full sm:max-w-md bg-card border-t sm:border border-card-border rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-4 animate-slide-up">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-content">Pay {rs(inv.amount)}</h3>
            <p className="text-xs text-content-secondary">{inv.invoiceNumber} · {inv.planName} plan{inv.planSnapshot?.durationDays ? ` · ${inv.planSnapshot.durationDays} days` : ""}</p>
          </div>
          <button onClick={() => !busy && onClose()} aria-label="Close" className="p-1.5 rounded-full hover:bg-surface-secondary"><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50"><Check className="h-7 w-7 text-emerald-600" /></span>
            <p className="font-semibold text-content">Payment sent for checking</p>
            <p className="max-w-xs text-sm text-content-secondary">Your {inv.planName} plan starts as soon as our team verifies it — usually the same day. We&apos;ll send you a notification and an email.</p>
            <PushNudge context="payment" className="mt-2 w-full text-left" />
            <button onClick={onClose} className="mt-2 h-11 w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-bold">Done</button>
          </div>
        ) : !canPay || methods.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              Online payment details aren&apos;t set up yet. Message us and we&apos;ll activate your plan — your invoice number is <b>{inv.invoiceNumber}</b>.
            </p>
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="h-12 rounded-xl bg-[#25D366] hover:brightness-95 text-white font-bold flex items-center justify-center gap-2"><MessageCircle className="h-5 w-5" /> Pay via WhatsApp</a>
            ) : (
              <Link href="/page/contact-us" className="h-12 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold flex items-center justify-center gap-2"><MessageCircle className="h-5 w-5" /> Contact us to pay</Link>
            )}
          </div>
        ) : (
          <>
            {inv.status === "rejected" && inv.rejectionReason && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> <span><b>The last payment couldn&apos;t be verified.</b> {inv.rejectionReason}</span>
              </p>
            )}

            {/* 1 · where to send it */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-content-tertiary">1 · Send exactly {rs(inv.amount)} to any one</p>
              <button onClick={() => copy(String(Math.round(inv.amount)))} className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-card-border px-3 py-1 text-xs font-semibold text-content hover:border-primary"><Copy className="h-3 w-3" /> Copy amount {Math.round(inv.amount)}</button>
              <div className="flex flex-col gap-2">
                {methods.map((m) => {
                  const Icon = TYPE_ICON(`${m.type} ${m.title}`);
                  return (
                    <div key={m.title} className="rounded-xl border border-card-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-bold text-content"><Icon className="h-4 w-4 text-primary" /> {m.title}</span>
                        <button onClick={() => copy(m.account)} className="text-xs font-semibold text-primary flex items-center gap-1"><Copy className="h-3 w-3" /> Copy</button>
                      </div>
                      <p className="mt-1 text-[15px] font-mono text-content break-all">{m.account}</p>
                      {m.name && <p className="text-[11px] text-content-tertiary">Account title: {m.name}</p>}
                      {m.instructions && <p className="text-[11px] text-content-tertiary mt-0.5">{m.instructions}</p>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2 · which one */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-content-tertiary">2 · Which account did you use?</p>
              <div className="flex flex-wrap gap-2">
                {methods.map((m) => (
                  <button key={m.title} type="button" onClick={() => setMethod(m.title)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${method === m.title ? "border-primary bg-primary text-white" : "border-card-border text-content hover:border-primary"}`}>
                    {m.title}
                  </button>
                ))}
              </div>
              <label className="block mt-3">
                <span className="text-xs font-semibold text-content">Transaction ID or your number <span className="font-normal text-content-tertiary">(optional)</span></span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. TID 884512 / 0300 1234567" className="mt-1 w-full h-11 rounded-xl border border-card-border px-3 text-sm outline-none focus:border-primary bg-surface" />
              </label>
            </div>

            {/* 3 · the proof */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-content-tertiary">3 · Upload the payment screenshot</p>
              <button type="button" onClick={() => fileRef.current?.click()} className="relative w-full aspect-[16/9] rounded-xl border-2 border-dashed border-card-border grid place-items-center overflow-hidden bg-surface-secondary hover:border-primary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {shot ? <img src={shot} alt="Payment screenshot" className="absolute inset-0 w-full h-full object-contain" />
                  : uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  : <span className="flex flex-col items-center gap-1 text-content-tertiary text-xs font-semibold"><Upload className="h-5 w-5" /> Add the confirmation screenshot<span className="font-normal">From JazzCash, Easypaisa or your bank app</span></span>}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
              </button>
              {shot && !uploading && <button type="button" onClick={() => fileRef.current?.click()} className="mt-1.5 text-xs font-semibold text-primary">Change screenshot</button>}
            </div>

            {err && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{err}</p>}

            <button onClick={submit} disabled={busy || uploading || !shot} className="h-12 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> I have paid — send for checking</>}
            </button>
            <p className="text-center text-[11px] text-content-tertiary">Nothing is charged automatically. Our team checks the screenshot and starts your plan.</p>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-center text-xs font-semibold text-primary">Need help? Message us on WhatsApp</a>}
          </>
        )}
      </div>
    </div>
  );
}
