"use client";

/**
 * What a seller sees on their own ad, instead of call/WhatsApp buttons to
 * themselves: its status and numbers, Edit, Mark as sold and My ads — and the
 * way to get it seen more: Boost with a plan's featured slot, or, on the free
 * plan, the offer to reach up to 3x more buyers (strongest right after
 * posting, ?posted=1).
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Eye, Loader2, Pencil, Rocket, Sparkles, Tag, Zap, LayoutList } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

export type OwnerInfo = {
  adId: string; slug: string; status: string; views: number; leads: number; saves: number;
  featuredUntil: string | null; isFree: boolean; boostsLeft: number;
};

export function OwnerPanel({ o }: { o: OwnerInfo }) {
  const router = useRouter();
  const { toast } = useToast();
  const [justPosted, setJustPosted] = useState(false);
  const [busy, setBusy] = useState("");
  const [featuredUntil, setFeaturedUntil] = useState(o.featuredUntil);
  useEffect(() => { setJustPosted(new URLSearchParams(window.location.search).get("posted") === "1"); }, []);

  const live = o.status === "approved";
  const featured = !!featuredUntil && new Date(featuredUntil) > new Date();

  const boost = async () => {
    setBusy("boost");
    try {
      const r = await fetch(withBasePath(`/api/ads/${o.adId}/boost`), { method: "POST" });
      const j = await r.json().catch(() => null);
      if (j?.success) { toast.success(j.message); setFeaturedUntil(j.data.featuredExpiresAt); }
      else if (j?.code === "no-plan" || j?.code === "no-slots") router.push(`/dashboard/plans?ad=${o.adId}`);
      else toast.error(j?.message || "Couldn't boost it");
    } finally { setBusy(""); }
  };
  const sold = async () => {
    if (!confirm("Mark this ad as sold? It stops showing to buyers and frees a slot for a new ad.")) return;
    setBusy("sold");
    try {
      const r = await fetch(withBasePath(`/api/ads/${o.adId}`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "sold" }) });
      const j = await r.json().catch(() => null);
      if (j?.success) { toast.success("Marked as sold"); router.refresh(); } else toast.error(j?.message || "Couldn't update it");
    } finally { setBusy(""); }
  };

  return (
    <section aria-label="Your ad" className="rounded-xl border border-primary/30 bg-card p-4 flex flex-col gap-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">Your ad</p>
          <p className="text-sm font-bold text-content flex items-center gap-1.5 mt-0.5">
            {live ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Live — buyers can see it</>
              : o.status === "review" ? <><Clock className="h-4 w-4 text-amber-600" /> Being checked — usually within a few hours</>
              : o.status === "sold out" ? <><Tag className="h-4 w-4 text-content-tertiary" /> Sold</>
              : o.status === "expired" ? <><Clock className="h-4 w-4 text-content-tertiary" /> Expired — renew it from My ads</>
              : <>Not approved — see My ads for why</>}
          </p>
        </div>
        {featured && <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-2 py-1 text-[11px] font-bold"><Zap className="h-3 w-3" /> Featured</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Views", o.views], ["Buyers in touch", o.leads], ["Saves", o.saves]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg bg-surface-secondary py-2"><p className="text-base font-bold text-content tabular-nums">{Number(v).toLocaleString("en-US")}</p><p className="text-[10px] text-content-tertiary">{l}</p></div>
        ))}
      </div>

      {live && !featured && (o.isFree ? (
        <Link href={`/dashboard/plans?ad=${o.adId}`} className={`flex items-center gap-3 rounded-xl p-3 text-white bg-gradient-to-r from-primary to-primary-dark ${justPosted ? "ring-4 ring-primary/25" : ""}`}>
          <span className="grid place-items-center h-9 w-9 rounded-full bg-white/15 shrink-0"><Sparkles className="h-4.5 w-4.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight">{justPosted ? "Your ad is live! Reach up to 3x more buyers" : "Reach up to 3x more buyers"}</span>
            <span className="block text-[11px] text-white/85">Feature it — shown first in search and on the home page.</span>
          </span>
        </Link>
      ) : o.boostsLeft > 0 ? (
        <button onClick={boost} disabled={busy === "boost"} className="h-11 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {busy === "boost" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Boost this ad ({o.boostsLeft} left)
        </button>
      ) : (
        <Link href={`/dashboard/plans?ad=${o.adId}`} className="h-11 rounded-xl border border-primary text-primary text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-primary/5"><Rocket className="h-4 w-4" /> Get more boosts</Link>
      ))}

      <div className="grid grid-cols-3 gap-2">
        <Link href={`/ads/${o.slug}/edit`} className="h-10 rounded-lg border border-card-border text-xs font-bold text-content inline-flex items-center justify-center gap-1.5 hover:border-primary"><Pencil className="h-3.5 w-3.5" /> Edit</Link>
        <button onClick={sold} disabled={!live || busy === "sold"} className="h-10 rounded-lg border border-card-border text-xs font-bold text-content inline-flex items-center justify-center gap-1.5 hover:border-primary disabled:opacity-40">
          {busy === "sold" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />} Sold
        </button>
        <Link href="/dashboard/seller" className="h-10 rounded-lg border border-card-border text-xs font-bold text-content inline-flex items-center justify-center gap-1.5 hover:border-primary"><LayoutList className="h-3.5 w-3.5" /> My ads</Link>
      </div>
      <p className="text-[11px] text-content-tertiary flex items-center gap-1"><Eye className="h-3 w-3" /> Only you see this box.</p>
    </section>
  );
}
