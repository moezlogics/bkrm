"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Eye, Heart, Radio, Package, Plus, Pencil, Trash2, CheckCircle2, RotateCcw, ExternalLink, Loader2, TrendingUp, ShieldCheck, Clock, AlertTriangle, ChevronRight, Zap, Crown, Rocket, Sparkles, PhoneCall, RefreshCw,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { AppBar } from "@/components/layout/AppChrome";
import { StoryCardModal } from "@/components/media/StoryCardModal";
import { withBasePath } from "@/lib/base-path";
import { PLACEHOLDER_IMG } from "@/lib/cdn-image";
import { specHighlights } from "@/vertical";
import { PushNudge } from "@/components/push/PushNudge";

type Item = {
  _id: string; name: string; slug: string; price: number | null; status: string;
  clicks: number; impressions: number; favouritesCount: number;
  mainImage?: string; galleryImages?: string[]; condition?: string; city?: string; createdAt: string;
  isFeatured?: boolean; featuredExpiresAt?: string | null; customFieldValues?: Record<string, unknown>;
  expiresAt?: string | null; phoneClicks?: number; whatsappClicks?: number; chatClicks?: number; flagReasons?: string[];
};
type Expiry = { days: number; renewDays: number };
const DAY_MS = 864e5;
const leadsOf = (i: Item) => (i.phoneClicks || 0) + (i.whatsappClicks || 0) + (i.chatClicks || 0);
/** Renew is offered for an expired ad inside the window, or a live one in its last 3 days. */
const canRenew = (i: Item, e: Expiry) => {
  if (e.days <= 0 || !i.expiresAt) return false;
  const end = +new Date(i.expiresAt), now = Date.now();
  if (i.status === "expired") return e.renewDays <= 0 || now - end <= e.renewDays * DAY_MS;
  return i.status === "approved" && end - now <= 3 * DAY_MS;
};
const daysLeft = (iso: string) => Math.max(0, Math.ceil((+new Date(iso) - Date.now()) / DAY_MS));
type Usr = { _id?: string; name?: string; profileImage?: string; createdAt?: string; rating?: number; ratingCount?: number; verificationLevel?: number; verificationStatus?: string; verificationDoc?: { rejectionReason?: string }; salesCount?: number; city?: string };
type Plan = { isFree: boolean; planName: string; listingLimit: number; featuredLimit: number; featuredUsed: number; endDate?: string | null; listingsUsed: number };

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: "Live", cls: "bg-emerald-50 text-emerald-700" },
  "sold out": { label: "Sold", cls: "bg-zinc-100 text-zinc-600" },
  review: { label: "In review", cls: "bg-amber-50 text-amber-700" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-600" },
  expired: { label: "Expired", cls: "bg-zinc-100 text-zinc-500" },
};

export function SellerDashboard({ user, listings, plan, siteName, expiry = { days: 0, renewDays: 0 } }: { user: Usr; listings: Item[]; plan: Plan; siteName: string; expiry?: Expiry }) {
  const { toast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(listings);
  const [featuredUsed, setFeaturedUsed] = useState(plan.featuredUsed);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [flyerAd, setFlyerAd] = useState<Item | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const totals = useMemo(() => ({
    active: items.filter((i) => i.status === "approved").length,
    views: items.reduce((s, i) => s + (i.clicks || 0), 0),
    impressions: items.reduce((s, i) => s + (i.impressions || 0), 0),
    favourites: items.reduce((s, i) => s + (i.favouritesCount || 0), 0),
    leads: items.reduce((s, i) => s + leadsOf(i), 0),
  }), [items]);

  const renew = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(withBasePath(`/api/ads/${id}/renew`), { method: "POST" });
      const j = await r.json();
      if (j.success) {
        toast.success(j.message);
        setItems((p) => p.map((i) => (i._id === id ? { ...i, status: "approved", expiresAt: j.data.expiresAt } : i)));
      } else {
        toast.error(j.message || "Couldn't renew");
        if (j.code === "limit") router.push("/dashboard/plans");
      }
    } catch { toast.error("Couldn't renew"); } finally { setBusy(null); }
  };
  const ctr = totals.impressions ? Math.round((totals.views / totals.impressions) * 100) : 0;

  const isFeaturedNow = (it: Item) => it.isFeatured && (!it.featuredExpiresAt || new Date(it.featuredExpiresAt) > new Date());

  const patch = async (id: string, body: any) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/ads/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.success) { setItems((p) => p.map((i) => (i._id === id ? { ...i, ...mapBack(body, j.data) } : i))); return true; }
      toast.error(j.message || "Update fail");
    } catch { toast.error("Update fail"); } finally { setBusy(null); }
    return false;
  };
  const mapBack = (body: any, data: any): Partial<Item> => ({
    name: data?.title ?? body.title ?? undefined,
    price: data?.price ?? (body.price != null ? Number(body.price) : undefined),
    status: body.status === "sold" ? "sold out" : body.status === "active" ? "approved" : undefined,
  });

  const boost = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/ads/${id}/boost`, { method: "POST" });
      const j = await r.json();
      if (j.success) {
        toast.success(j.message);
        setItems((p) => p.map((i) => (i._id === id ? { ...i, isFeatured: true, featuredExpiresAt: j.data.featuredExpiresAt } : i)));
        setFeaturedUsed((u) => u + 1);
      } else {
        toast.error(j.message);
        if (j.code === "no-plan" || j.code === "no-slots") router.push(`/dashboard/plans?ad=${id}`);
      }
    } catch { toast.error("Boost fail"); } finally { setBusy(null); }
  };

  const del = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/ads/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (j.success) { setItems((p) => p.filter((i) => i._id !== id)); toast.success("Ad deleted"); }
      else toast.error(j.message || "Delete fail");
    } catch { toast.error("Delete fail"); } finally { setBusy(null); setConfirmDel(null); }
  };

  const memberSince = user.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear();
  const listingsUsed = items.filter((i) => i.status === "approved" || i.status === "review").length;
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

  return (
    <>
    <AppBar
      title="My ads"
      subtitle={`${items.length} ad${items.length === 1 ? "" : "s"}`}
      backHref="/dashboard"
      right={<Link href="/ads/post" className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold"><Plus className="h-4 w-4" /> Post</Link>}
    />
    <div className="max-w-5xl w-full mx-auto px-4 py-4 pb-10">
      {/* Verification prompt */}
      {user.verificationStatus !== "verified" && (user.verificationLevel ?? 0) < 2 && (
        <Link href="/dashboard/verify" className={`flex items-center gap-3 rounded-xl border p-3.5 mt-3 transition-colors ${
          user.verificationStatus === "pending" ? "border-amber-200 bg-amber-50" : user.verificationStatus === "rejected" ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50 hover:bg-blue-100"}`}>
          {user.verificationStatus === "pending" ? <Clock className="h-6 w-6 text-amber-500 shrink-0" /> : user.verificationStatus === "rejected" ? <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" /> : <ShieldCheck className="h-6 w-6 text-blue-600 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-content">{user.verificationStatus === "pending" ? "Verification under review" : user.verificationStatus === "rejected" ? "Verification rejected — please try again" : "Get verified — build buyer trust"}</p>
            <p className="text-[12px] text-content-secondary">{user.verificationStatus === "pending" ? "You'll get the verified badge once approved." : user.verificationStatus === "rejected" ? (user.verificationDoc?.rejectionReason || "Please re-submit with clear pictures.") : "Add your CNIC (front & back) — get the verified badge on every listing."}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-content-tertiary shrink-0" />
        </Link>
      )}

      {/* Plan & usage */}
      <div className="rounded-2xl bg-card shadow-sm ring-1 ring-black/[0.03] p-4 mt-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown className={`h-5 w-5 ${plan.isFree ? "text-content-tertiary" : "text-amber-500"}`} />
            <div>
              <p className="text-sm font-bold text-content">{plan.isFree ? "Free plan" : `${plan.planName} plan`}</p>
              {!plan.isFree && plan.endDate && <p className="text-[12px] text-content-tertiary">Valid till {new Date(plan.endDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</p>}
            </div>
          </div>
          <Link href="/dashboard/plans" className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold px-3 h-9 rounded-lg"><Rocket className="h-3.5 w-3.5" /> {plan.isFree ? "Buy plan" : "Manage / upgrade"}</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Usage label="Listings" used={listingsUsed} limit={plan.listingLimit} pct={pct(listingsUsed, plan.listingLimit)} />
          <Usage label="Featured / Boost" used={featuredUsed} limit={plan.featuredLimit} pct={pct(featuredUsed, plan.featuredLimit)} />
        </div>
        {/* Free sellers with a live ad: the one upgrade that pays for itself. */}
        {plan.isFree && totals.active > 0 && (
          <Link href="/dashboard/plans?ad=1" className="mt-3 flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary to-primary-dark p-3 text-white">
            <span className="grid place-items-center h-9 w-9 rounded-full bg-white/15 shrink-0"><Sparkles className="h-4.5 w-4.5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold leading-tight">Reach up to 3x more buyers</span>
              <span className="block text-[12px] text-white/85 leading-snug">Featured ads are shown first in search and on the home page.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/80" />
          </Link>
        )}
      </div>

      <PushNudge context="post" className="mt-3" />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-3">
        {[
          { label: "Active ads", value: totals.active, icon: Package },
          { label: "Impressions", value: totals.impressions, icon: Radio },
          { label: "Views", value: totals.views, icon: Eye, hint: `${ctr}% click rate` },
          { label: "Buyers in touch", value: totals.leads, icon: PhoneCall, hint: totals.views ? `${Math.round((totals.leads / totals.views) * 100)}% of views called, WhatsApped or chatted` : undefined },
          { label: "Saves", value: totals.favourites, icon: Heart },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] p-3.5 flex flex-col gap-1">
            <div className="flex items-center justify-between"><span className="text-[12px] font-bold uppercase tracking-wide text-content-tertiary">{s.label}</span><s.icon className="h-4 w-4 text-primary" /></div>
            <span className="text-2xl font-bold text-content tabular-nums">{s.value.toLocaleString()}</span>
            {s.hint && <span className="text-[11px] text-content-tertiary flex items-center gap-1"><TrendingUp className="h-3 w-3" />{s.hint}</span>}
          </div>
        ))}
      </div>

      {/* Listings */}
      <div className="flex items-center justify-between mb-2 mt-6">
        <h2 className="text-base font-bold text-content">My listings ({items.length})</h2>
        <Link href="/ads/post" className="sm:hidden flex items-center gap-1 text-sm font-semibold text-primary"><Plus className="h-4 w-4" /> Post</Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-card-border bg-surface-secondary p-10 text-center">
          <Package className="h-10 w-10 text-content-tertiary mx-auto mb-3" />
          <p className="text-sm text-content-secondary">No listings yet.</p>
          <Link href="/ads/post" className="mt-4 inline-block rounded-md bg-primary text-white font-semibold text-sm px-6 py-2.5 shadow-xs hover:bg-primary-dark transition-colors">Post your first ad</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const st = STATUS[it.status] || STATUS.review;
            const img = it.mainImage || it.galleryImages?.[0];
            const feat = isFeaturedNow(it);
            return (
              <div key={it._id} className="rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] p-2.5 flex gap-3">
                <Link href={`/ads/${it.slug}`} className="shrink-0 h-16 w-16 rounded-lg overflow-hidden bg-surface-secondary grid place-items-center relative">
                  {img ? <Image src={img} alt="" width={64} height={64} className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-content-tertiary" />}
                  {feat && <span className="absolute top-0 left-0 bg-secondary text-white text-[8px] font-bold px-1 rounded-br">TOP</span>}
                </Link>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/ads/${it.slug}`} className="font-semibold text-sm text-content line-clamp-1 hover:text-primary">{it.name}</Link>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <span className="text-sm font-bold text-content">{it.price != null ? formatPrice(it.price) : "—"}</span>
                  <div className="flex items-center gap-3 text-[12px] text-content-tertiary">
                    <span className="flex items-center gap-1"><Radio className="h-3 w-3" />{it.impressions || 0}</span>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{it.clicks || 0}</span>
                    <span className="flex items-center gap-1" title="Calls, WhatsApp and chats"><PhoneCall className="h-3 w-3" />{leadsOf(it)}</span>
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{it.favouritesCount || 0}</span>
                    <span suppressHydrationWarning className="ml-auto">{formatDate(it.createdAt)}</span>
                  </div>
                  {it.status === "approved" && it.expiresAt && expiry.days > 0 && (
                    <span suppressHydrationWarning className={`text-[12px] ${daysLeft(it.expiresAt) <= 3 ? "font-bold text-amber-700" : "text-content-tertiary"}`}>
                      {daysLeft(it.expiresAt) === 0 ? "Expires today" : `Expires in ${daysLeft(it.expiresAt)} day${daysLeft(it.expiresAt) === 1 ? "" : "s"}`}
                    </span>
                  )}
                  {it.status === "expired" && (
                    <span suppressHydrationWarning className="text-[12px] font-semibold text-content-secondary">
                      {canRenew(it, expiry) ? "Expired — buyers can't see it. Renew to put it back up." : "Expired. Post it again as a new ad."}
                    </span>
                  )}
                  {it.status === "rejected" && !!it.flagReasons?.length && (
                    <span className="text-[12px] text-red-600">Not approved: {it.flagReasons[0]}. Edit the ad to fix it.</span>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {it.status === "approved" && (feat ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-secondary/10 text-secondary-dark px-2 py-1 text-[12px] font-bold"><Zap className="h-3 w-3" /> Featured</span>
                    ) : (
                      <ActBtn onClick={() => boost(it._id)} icon={Rocket} label="Boost" loading={busy === it._id} highlight />
                    ))}
                    {canRenew(it, expiry) && <ActBtn onClick={() => renew(it._id)} icon={RefreshCw} label="Renew" loading={busy === it._id} highlight />}
                    <ActBtn onClick={() => router.push(`/ads/${it.slug}/edit`)} icon={Pencil} label="Edit" />
                    {it.status === "sold out" ? (
                      <ActBtn onClick={() => patch(it._id, { status: "active" })} icon={RotateCcw} label="Relist" loading={busy === it._id} />
                    ) : it.status === "approved" && (
                      <ActBtn onClick={() => patch(it._id, { status: "sold" })} icon={CheckCircle2} label="Mark sold" loading={busy === it._id} />
                    )}
                    <ActBtn onClick={() => setFlyerAd(it)} icon={Sparkles} label="Story Flyer" />
                    <a href={withBasePath(`/ads/${it.slug}`)} className="inline-flex items-center gap-1 rounded-md border border-card-border px-2 py-1 text-[12px] font-semibold text-content-secondary hover:border-primary hover:text-primary"><ExternalLink className="h-3 w-3" /> View</a>
                    <ActBtn onClick={() => setConfirmDel(it._id)} icon={Trash2} label="Delete" danger />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setConfirmDel(null)} />
          <div className="relative z-10 w-full max-w-sm bg-card border border-card-border rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="font-bold text-content">Delete this ad?</h3>
            <p className="text-sm text-content-secondary">This action can't be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-lg border border-card-border text-sm font-semibold">Cancel</button>
              <button onClick={() => del(confirmDel)} disabled={busy === confirmDel} className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-bold flex items-center gap-2">{busy === confirmDel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete</button>
            </div>
          </div>
        </div>
      )}

      {flyerAd && (
        <StoryCardModal
          open={!!flyerAd}
          onClose={() => setFlyerAd(null)}
          title={flyerAd.name}
          priceLabel={flyerAd.price != null ? formatPrice(flyerAd.price) : "Rs. 0"}
          imageUrl={flyerAd.mainImage || flyerAd.galleryImages?.[0] || PLACEHOLDER_IMG}
          url={typeof window !== "undefined" ? `${window.location.origin}${withBasePath(`/ads/${flyerAd.slug}`)}` : withBasePath(`/ads/${flyerAd.slug}`)}
          condition={flyerAd.condition}
          city={flyerAd.city}
          highlights={specHighlights(flyerAd.customFieldValues).map((h) => h.value)}
          siteName={siteName}
          isShop={(user.verificationLevel ?? 0) >= 3}
          sellerName={user.name || "Seller"}
        />
      )}
    </div>
    </>
  );
}

function Usage({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12px]"><span className="font-semibold text-content-secondary">{label}</span><span className="font-bold text-content tabular-nums">{used}/{limit}</span></div>
      <div className="h-2 rounded-full bg-surface-tertiary overflow-hidden"><div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function ActBtn({ onClick, icon: Icon, label, danger, loading, highlight }: { onClick: () => void; icon: any; label: string; danger?: boolean; loading?: boolean; highlight?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-semibold transition-colors ${
      highlight ? "border-secondary/40 bg-secondary/10 text-secondary-dark hover:bg-secondary hover:text-white" :
      danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-card-border text-content-secondary hover:border-primary hover:text-primary"}`}>
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />} {label}
    </button>
  );
}
