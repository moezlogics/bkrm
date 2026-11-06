"use client";

/**
 * Admin → Users → one account, everything we hold on it on one page:
 * profile and contact, CNIC verification, every number used on their ads
 * (and other accounts using the same numbers), ads and leads, plan and
 * payments, conversations (read-only, each opening logged), offers, reviews,
 * reports, saved ads, devices, notifications, bookings and the admin log.
 * Actions (block, give a plan, verify…) stay in the Users drawer — one tap.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Mail, Phone, MapPin, CalendarDays, Clock, ShieldCheck, Ban, Store, IdCard, Copy, Megaphone,
  MessageSquare, CreditCard, Star, Flag, Heart, Smartphone, Bell, History, Gift, X, TriangleAlert, ExternalLink, Settings2, CalendarCheck,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

const n = (v: number) => Number(v || 0).toLocaleString("en-US");
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const ago = (d?: string | null) => {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const STATUS_LABEL: Record<string, string> = { approved: "Live", review: "In review", rejected: "Rejected", "sold out": "Sold", expired: "Expired" };

const SECTIONS = [
  ["overview", "Overview"], ["trust", "Verification & numbers"], ["ads", "Ads"], ["money", "Plan & payments"],
  ["chats", "Chats"], ["deals", "Offers & reviews"], ["activity", "Devices & activity"],
] as const;

export default function AdminUserFull() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [sum, setSum] = useState<any>(null);
  const [full, setFull] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chat, setChat] = useState<{ item: string; other: string } | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, b] = await Promise.all([
        fetch(withBasePath(`/api/admin/users/${id}`)).then((r) => r.json()),
        fetch(withBasePath(`/api/admin/users/${id}/full`)).then((r) => r.json()),
      ]);
      if (!a.success) throw new Error(a.message);
      if (!b.success) throw new Error(b.message);
      setSum(a.data); setFull(b.data);
    } catch (e: any) { setErr(e?.message || "Couldn't load this account"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const copy = (t: string, what: string) => { navigator.clipboard?.writeText(t); toast.success(`${what} copied`); };

  if (err) return <div className="p-6"><p className="text-sm text-danger">{err}</p><Link href="/admin/users" className="mt-3 inline-block text-sm font-bold text-primary">← Back to users</Link></div>;
  if (!sum || !full) return <div className="py-24 grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  const u = sum.user;
  const v = full.verification;
  const leads = sum.ads.leads.calls + sum.ads.leads.whatsapp + sum.ads.leads.chats;

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm font-semibold text-content-secondary hover:text-primary"><ArrowLeft className="h-4 w-4" /> Users</Link>
        <Link href={`/admin/users?open=${id}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark"><Settings2 className="h-4 w-4" /> Manage account (block, plan, verify…)</Link>
      </div>

      {/* Header */}
      <section id="overview" className="rounded-2xl border border-card-border bg-card p-5 flex flex-col gap-4 scroll-mt-20">
        <div className="flex items-start gap-4">
          {u.profileImage
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={u.profileImage} alt="" className="h-16 w-16 rounded-full object-cover border border-card-border" />
            : <div className="h-16 w-16 rounded-full bg-primary/10 text-primary grid place-items-center text-2xl font-bold">{u.name?.[0]?.toUpperCase() || "U"}</div>}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-content flex items-center gap-2 flex-wrap">
              {u.name}
              {u.role === "admin" && <Tag tone="ok"><ShieldCheck className="h-3 w-3" /> Admin</Tag>}
              {u.isBlocked && <Tag tone="danger"><Ban className="h-3 w-3" /> Blocked</Tag>}
              <Tag tone="muted">{full.profile.isSeller ? "Selling account" : "Buying account"}</Tag>
              {v.level >= 2 && <Tag tone="ok"><ShieldCheck className="h-3 w-3" /> Verified seller</Tag>}
            </h1>
            {full.profile.isShop && <p className="text-sm text-content-secondary flex items-center gap-1 mt-0.5"><Store className="h-3.5 w-3.5" /> {full.profile.shopName}{full.profile.shopAddress ? ` · ${full.profile.shopAddress}` : ""}</p>}
            {full.profile.bio && <p className="text-sm text-content-secondary mt-1">{full.profile.bio}</p>}
            {u.isBlocked && u.blockReason && <p className="mt-1 text-xs text-danger">Blocked {u.blockedAt ? `on ${fmtDate(u.blockedAt)}` : ""}: {u.blockReason}</p>}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
          <Row icon={Mail}><a href={`mailto:${u.email}`} className="hover:text-primary break-all">{u.email}</a> {u.emailVerified === false ? <span className="text-amber-600 text-xs">(not confirmed)</span> : null}</Row>
          <Row icon={Phone}>{u.phoneNumber ? <a href={`tel:${u.phoneNumber}`} className="hover:text-primary">{u.phoneNumber}</a> : <span className="text-content-tertiary">No number on the account</span>}</Row>
          <Row icon={MapPin}>{[u.area, u.city, u.state].filter(Boolean).join(", ") || "No location"}</Row>
          <Row icon={CalendarDays}>Joined {fmtDate(u.createdAt)} · {u.provider === "google" ? "Google" : "email"} sign-up</Row>
          <Row icon={Clock}>Last sign-in {ago(u.lastLoginAt)}{u.lastLoginIp ? ` · IP ${u.lastLoginIp}` : ""}</Row>
          <Row icon={Bell}>{sum.devices} device{sum.devices === 1 ? "" : "s"} with notifications</Row>
        </div>
        {u.adminNote && <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-950"><b>Admin note:</b> {u.adminNote}</p>}
        <nav className="flex flex-wrap gap-1.5 border-t border-card-border pt-3">
          {SECTIONS.map(([k, label]) => <a key={k} href={`#${k}`} className="h-8 px-3 rounded-full border border-card-border text-xs font-semibold text-content-secondary hover:border-primary hover:text-primary grid place-items-center">{label}</a>)}
        </nav>
      </section>

      {/* Verification & numbers */}
      <section id="trust" className="grid lg:grid-cols-2 gap-5 scroll-mt-20">
        <Card title="CNIC verification" icon={IdCard} right={<Link href="/admin/verifications" className="text-xs font-bold text-primary">Verifications →</Link>}>
          <p className="text-sm">
            Status: <b className={v.level >= 2 || v.status === "verified" ? "text-emerald-600" : v.status === "pending" ? "text-amber-600" : v.status === "rejected" ? "text-danger" : "text-content-secondary"}>
              {v.level >= 2 || v.status === "verified" ? "Approved" : v.status === "pending" ? "Waiting for review" : v.status === "rejected" ? "Rejected" : "Not sent"}
            </b>
            {v.submittedAt ? ` · sent ${fmtDate(v.submittedAt)}` : ""}{v.reviewedAt ? ` · reviewed ${fmtDate(v.reviewedAt)}` : ""}
          </p>
          {(v.cnicNumber || v.fullName) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {v.fullName && <span>Name on card: <b>{v.fullName}</b></span>}
              {v.cnicNumber && <button onClick={() => copy(v.cnicNumber, "CNIC number")} className="inline-flex items-center gap-1 font-mono font-bold hover:text-primary">{v.cnicNumber} <Copy className="h-3 w-3" /></button>}
            </div>
          )}
          {v.rejectionReason && v.status === "rejected" && <p className="mt-1 text-xs text-danger">Reason: {v.rejectionReason}</p>}
          {(v.frontImage || v.backImage) && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[["Front", v.frontImage], ["Back", v.backImage]].map(([label, src]) => src ? (
                <a key={label} href={src} target="_blank" rel="noreferrer" className="block rounded-xl border border-card-border overflow-hidden bg-surface-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`CNIC ${label}`} className="aspect-[3/2] w-full object-cover" />
                  <span className="block px-2 py-1 text-[11px] font-semibold text-content-secondary">CNIC {label.toLowerCase()}</span>
                </a>
              ) : null)}
            </div>
          )}
        </Card>

        <Card title="Phone numbers" icon={Phone}>
          <ul className="text-sm divide-y divide-card-border/60">
            <li className="py-1.5 flex justify-between gap-2"><span>On the account</span><b>{full.phones.account || "—"}</b></li>
            {full.phones.onAds.map((p: any) => (
              <li key={p.number} className="py-1.5 flex justify-between gap-2">
                <span>On {n(p.ads)} {p.ads === 1 ? "ad" : "ads"}</span>
                <span className="flex items-center gap-2"><a href={`tel:${p.number}`} className="font-bold hover:text-primary">{p.number}</a>
                  <a href={`https://wa.me/92${p.number.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-600">WhatsApp</a></span>
              </li>
            ))}
            {!full.phones.onAds.length && <li className="py-1.5 text-content-tertiary">No numbers on ads yet.</li>}
          </ul>
          {full.phones.others.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-950">
              <p className="font-bold flex items-center gap-1.5"><TriangleAlert className="h-4 w-4" /> The same number is on other accounts</p>
              <ul className="mt-1.5 space-y-1">
                {full.phones.others.map((o: any) => (
                  <li key={o._id}><Link href={`/admin/users/${o._id}`} className="font-semibold underline">{o.name}</Link> · {o.email}{o.isBlocked ? <b className="text-danger"> · blocked</b> : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </section>

      {/* Ads */}
      <section id="ads" className="scroll-mt-20">
        <Card title={`Ads (${n(sum.ads.total)})`} icon={Megaphone} right={<Link href={`/admin/listings?seller=${id}`} className="text-xs font-bold text-primary">All their ads →</Link>}>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Stat label="Live" value={n(sum.ads.status.approved || 0)} />
            <Stat label="In review" value={n(sum.ads.status.review || 0)} />
            <Stat label="Sold" value={n(sum.ads.status["sold out"] || 0)} />
            <Stat label="Views" value={n(sum.ads.views)} />
            <Stat label="Leads" value={n(leads)} hint={`${n(sum.ads.leads.calls)} calls · ${n(sum.ads.leads.whatsapp)} WhatsApp · ${n(sum.ads.leads.chats)} chats`} />
            <Stat label="Saves" value={n(sum.ads.saves)} />
          </div>
          {sum.ads.recent.length > 0 && (
            <ul className="mt-3 divide-y divide-card-border/60">
              {sum.ads.recent.map((l: any) => (
                <li key={l._id} className="py-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image ? <img src={l.image} alt="" className="h-11 w-11 rounded-lg object-cover border border-card-border shrink-0" /> : <div className="h-11 w-11 rounded-lg bg-surface-secondary shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <a href={withBasePath(`/ads/${l.slug}`)} target="_blank" rel="noreferrer" className="text-sm font-semibold truncate block hover:text-primary">{l.name}</a>
                    <div className="text-[11px] text-content-secondary">
                      {l.price != null ? `Rs ${n(l.price)} · ` : ""}posted {fmtDate(l.createdAt)} · {n(l.clicks || 0)} views · {n((l.phoneClicks || 0) + (l.whatsappClicks || 0) + (l.chatClicks || 0))} leads
                      {l.isFeatured ? " · featured" : ""}{l.flagReasons?.length ? ` · flags: ${l.flagReasons.slice(0, 2).join(", ")}` : ""}
                    </div>
                  </div>
                  <Tag tone={l.status === "approved" ? "ok" : l.status === "rejected" ? "danger" : l.status === "review" ? "warn" : "muted"}>{l.blockHidden ? "Hidden (block)" : STATUS_LABEL[l.status] || l.status}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Plan & payments */}
      <section id="money" className="grid lg:grid-cols-2 gap-5 scroll-mt-20">
        <Card title="Plan" icon={Gift}>
          {sum.plan ? <p className="text-sm"><b className="text-emerald-600">{sum.plan.planName}</b> until {fmtDate(sum.plan.endDate)} · {sum.plan.listingLimit} live ads · {sum.plan.featuredUsed}/{sum.plan.featuredLimit} boosts used</p>
            : <p className="text-sm text-content-secondary">Free allowance.</p>}
          {sum.planHistory.length > 0 && (
            <ul className="mt-2 text-xs text-content-secondary space-y-1">
              {sum.planHistory.map((p: any) => <li key={p._id}>{p.planName} · {fmtDate(p.startDate)} → {fmtDate(p.endDate)} · {p.status}{p.invoiceId ? "" : " · given by admin"}</li>)}
            </ul>
          )}
        </Card>
        <Card title="Payments" icon={CreditCard} right={<Link href="/admin/invoices" className="text-xs font-bold text-primary">Invoices →</Link>}>
          {sum.invoices.length ? (
            <ul className="text-sm divide-y divide-card-border/60">
              {sum.invoices.map((i: any) => (
                <li key={i._id} className="py-1.5 flex items-center justify-between gap-2">
                  <span className="truncate">{i.invoiceNumber} · {i.planName} · {fmtDate(i.createdAt)}</span>
                  <span className="flex items-center gap-2 shrink-0"><span className="tabular-nums">Rs {n(i.amount)}</span><Tag tone={i.status === "approved" ? "ok" : i.status === "rejected" ? "danger" : "warn"}>{i.status.replace("_", " ")}</Tag></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-content-secondary">No payments.</p>}
        </Card>
      </section>

      {/* Chats */}
      <section id="chats" className="scroll-mt-20">
        <Card title={`Conversations (${full.chats.length}${full.chats.length >= 60 ? "+" : ""})`} icon={MessageSquare}>
          <p className="text-xs text-content-secondary -mt-1 mb-2">Read-only. Opening one is recorded in the activity log, and nothing is marked as read.</p>
          {full.chats.length ? (
            <ul className="divide-y divide-card-border/60">
              {full.chats.map((t: any) => (
                <li key={`${t.item}_${t.other}`}>
                  <button onClick={() => setChat({ item: t.item, other: t.other })} className="w-full text-left py-2.5 flex items-start gap-3 hover:bg-surface-secondary rounded-lg px-2 -mx-2">
                    <MessageSquare className="h-4 w-4 mt-0.5 text-content-tertiary shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{t.role === "seller" ? "Buyer" : "Seller"}: {t.otherName} <span className="font-normal text-content-secondary">· {t.ad?.name || "deleted ad"}</span></span>
                      <span className="block text-[12px] text-content-secondary truncate">{t.lastMine ? "They: " : `${t.otherName.split(" ")[0]}: `}{t.last}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-content-tertiary">{n(t.count)} msgs<br />{ago(t.lastAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-content-secondary">No conversations.</p>}
        </Card>
      </section>

      {/* Offers, reviews, reports, saved */}
      <section id="deals" className="grid lg:grid-cols-2 gap-5 scroll-mt-20">
        <Card title="Offers" icon={CreditCard}>
          <p className="text-sm">{n(full.offers.made)} made as a buyer · {n(full.offers.received)} received as a seller</p>
          {full.offers.recent.length > 0 && (
            <ul className="mt-2 text-xs text-content-secondary space-y-1">
              {full.offers.recent.map((o: any) => (
                <li key={o._id}>{fmtDate(o.createdAt)} · Rs {n(o.amount)} · {String(o.buyerId?._id) === id ? `to ${o.sellerId?.name || "?"}` : `from ${o.buyerId?.name || "?"}`} · “{o.itemId?.name || "deleted ad"}” · {o.status}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Reviews" icon={Star}>
          <p className="text-sm">{full.reviews.received ? <><b>{full.reviews.average}★</b> from {n(full.reviews.received)} reviews{full.reviews.hidden ? ` (${full.reviews.hidden} hidden)` : ""}</> : "No reviews received"} · {n(full.reviews.given)} written by them</p>
          {full.reviews.recent.length > 0 && (
            <ul className="mt-2 text-xs text-content-secondary space-y-1.5">
              {full.reviews.recent.map((r: any) => (
                <li key={r._id}>
                  <b className="text-content">{r.rating}★</b> {String(r.sellerId?._id) === id ? `from ${r.reviewerId?.name || r.guestName || "a guest"}` : `to ${r.sellerId?.name || "?"}`}
                  {r.dealVerified ? " · bought here" : r.verified ? " · verified" : ""}{r.status === "hidden" ? " · hidden" : ""} · {fmtDate(r.createdAt)}
                  {r.comment ? <span className="block text-content-secondary">“{r.comment}”</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Reports" icon={Flag} right={sum.reports.against > 0 ? <Link href={`/admin/reports?seller=${id}`} className="text-xs font-bold text-primary">Open reports →</Link> : undefined}>
          <p className="text-sm"><span className={sum.reports.open ? "font-bold text-danger" : ""}>{sum.reports.against} against them</span>{sum.reports.open ? ` (${sum.reports.open} open)` : ""} · {sum.reports.filed} filed by them</p>
          {sum.reports.recent.length > 0 && (
            <ul className="mt-2 text-xs text-content-secondary space-y-1">
              {sum.reports.recent.map((r: any) => <li key={r._id}>{fmtDate(r.createdAt)} · {r.reportReasonId?.reason || r.reason || "Other"}{r.itemId?.name ? ` · “${r.itemId.name}”` : ""} · {r.status}</li>)}
            </ul>
          )}
        </Card>
        <Card title={`Saved ads (${n(sum.saved)})`} icon={Heart}>
          {full.saved.length ? (
            <ul className="text-xs text-content-secondary space-y-1">
              {full.saved.map((s: any) => <li key={s._id}><a href={withBasePath(`/ads/${s.slug}`)} target="_blank" rel="noreferrer" className="font-semibold text-content hover:text-primary">{s.name}</a>{s.price != null ? ` · Rs ${n(s.price)}` : ""} · {STATUS_LABEL[s.status] || s.status} · saved {fmtDate(s.savedAt)}</li>)}
            </ul>
          ) : <p className="text-sm text-content-secondary">Nothing saved.</p>}
        </Card>
        {full.bookings && (
          <Card title="Bookings" icon={CalendarCheck} right={<Link href="/admin/bookings" className="text-xs font-bold text-primary">Bookings →</Link>}>
            <p className="text-sm">{n(full.bookings.asCustomer)} made · {n(full.bookings.asProvider)} received</p>
            {full.bookings.recent.length > 0 && (
              <ul className="mt-2 text-xs text-content-secondary space-y-1">
                {full.bookings.recent.map((b: any) => <li key={b._id}><b className="text-content">{b.code}</b> · {b.role === "customer" ? "booked" : "received"} · {b.listingName} · {b.dayLabel} · {b.status}</li>)}
              </ul>
            )}
          </Card>
        )}
      </section>

      {/* Devices & activity */}
      <section id="activity" className="grid lg:grid-cols-2 gap-5 scroll-mt-20 pb-10">
        <Card title="Devices" icon={Smartphone}>
          {full.devices.length ? (
            <ul className="text-xs text-content-secondary space-y-1.5">
              {full.devices.map((d: any) => <li key={d._id}><b className="text-content">{d.browser} · {d.os}</b> ({d.device}) · {[d.area, d.city].filter(Boolean).join(", ") || "location unknown"} · last seen {ago(d.lastSeenAt)} · {d.status === "active" ? "notifications on" : "off"}</li>)}
            </ul>
          ) : <p className="text-sm text-content-secondary">No device has notifications on.</p>}
        </Card>
        <Card title="Recent notifications" icon={Bell}>
          {full.notifications.length ? (
            <ul className="text-xs text-content-secondary space-y-1">
              {full.notifications.map((x: any) => <li key={x._id}>{fmtTime(x.createdAt)} · <span className="text-content">{x.title}</span>{x.readAt ? "" : " · unread"}</li>)}
            </ul>
          ) : <p className="text-sm text-content-secondary">None yet.</p>}
        </Card>
        <Card title="Admin activity on this account" icon={History} right={<Link href={`/admin/activity?target=${id}`} className="text-xs font-bold text-primary">Full log →</Link>}>
          {sum.activity.length ? (
            <ul className="text-xs space-y-1.5">
              {sum.activity.map((a: any) => <li key={a._id} className="text-content-secondary"><span className="text-content font-semibold">{a.action}</span>{a.details ? ` — ${a.details}` : ""} · {a.adminName || a.adminEmail || "admin"} · {fmtDate(a.createdAt)}</li>)}
            </ul>
          ) : <p className="text-sm text-content-secondary">No admin actions yet.</p>}
        </Card>
      </section>

      {chat && <ChatViewer userId={id} item={chat.item} other={chat.other} onClose={() => setChat(null)} />}
    </div>
  );
}

function ChatViewer({ userId, item, other, onClose }: { userId: string; item: string; other: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(withBasePath(`/api/admin/users/${userId}/chat?item=${item}&with=${other}`)).then((r) => r.json())
      .then((j) => (j.success ? setD(j.data) : setErr(j.message))).catch(() => setErr("Couldn't load the conversation"));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [userId, item, other, onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Conversation" className="relative h-full w-full max-w-lg bg-card border-l border-card-border shadow-2xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-5 h-16 border-b border-card-border shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-content truncate">{d ? `${d.people[userId]} ↔ ${d.people[other]}` : "Conversation"}</p>
            {d?.ad && <a href={withBasePath(`/ads/${d.ad.slug}`)} target="_blank" rel="noreferrer" className="text-[11px] text-primary truncate inline-flex items-center gap-1">{d.ad.name} <ExternalLink className="h-3 w-3" /></a>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-secondary" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-surface-secondary/40">
          {err && <p className="text-sm text-danger">{err}</p>}
          {!d && !err && <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin inline-block text-primary" /></div>}
          {d?.messages.map((m: any) => {
            const mine = m.from === userId;
            return (
              <div key={m._id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "self-end bg-primary text-white" : "self-start bg-card border border-card-border text-content"}`}>
                <p className={`text-[10px] font-bold mb-0.5 ${mine ? "text-white/75" : "text-content-tertiary"}`}>{d.people[m.from]}</p>
                {m.offer && <p className="font-bold">Offer: Rs {n(m.offer.amount)} · {m.offer.status}</p>}
                {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                {m.file && <a href={m.file} target="_blank" rel="noreferrer" className="underline text-xs">Attachment</a>}
                {m.audio && <a href={m.audio} target="_blank" rel="noreferrer" className="underline text-xs">Voice note</a>}
                <p className={`text-[10px] mt-0.5 ${mine ? "text-white/70" : "text-content-tertiary"}`}>{fmtTime(m.at)}{mine ? (m.read ? " · read" : " · not read") : ""}</p>
              </div>
            );
          })}
          {d && !d.messages.length && <p className="text-sm text-content-secondary">No messages.</p>}
        </div>
      </aside>
    </div>
  );
}

function Card({ title, icon: Icon, right, children }: { title: string; icon: React.ElementType; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-card-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-content flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}
function Row({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return <div className="flex items-start gap-2 text-content-secondary"><Icon className="h-4 w-4 mt-0.5 shrink-0 text-content-tertiary" /><span className="min-w-0">{children}</span></div>;
}
function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="rounded-xl bg-surface-secondary px-3 py-2" title={hint}><div className="text-[10px] font-bold uppercase tracking-wide text-content-tertiary">{label}</div><div className="text-lg font-bold text-content tabular-nums">{value}</div></div>;
}
function Tag({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted"; children: React.ReactNode }) {
  const cls = { ok: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-700", danger: "bg-red-50 text-red-600", muted: "bg-surface-secondary text-content-secondary" }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{children}</span>;
}
