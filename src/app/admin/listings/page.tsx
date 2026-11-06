"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList, Loader2, CheckCircle, XCircle, Clock, Tag, ExternalLink, RefreshCw, Inbox, ShoppingBag,
  Search, AlertTriangle, Trash2, Hourglass, Layers, BadgeCheck, Ban, X, ChevronLeft, ChevronRight, Eye, PhoneCall, Star,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { withBasePath } from "@/lib/base-path";

interface Row {
  _id: string;
  name: string;
  slug: string;
  price: number | null;
  priceMode?: string;
  status: string;
  image: string | null;
  photos: number;
  createdAt: string;
  expiresAt?: string | null;
  soldAt?: string | null;
  city?: string;
  views: number;
  impressions: number;
  saves: number;
  leads: number;
  spamScore: number;
  flagReasons: string[];
  blockHidden: boolean;
  isDemo: boolean;
  featured: boolean;
  category: string | null;
  seller: { _id: string; name: string; email: string; phone?: string; blocked: boolean; verified: boolean; shop: string | null; since: string } | null;
}

type TabKey = "review" | "approved" | "rejected" | "sold" | "expired" | "all";
const TABS: { key: TabKey; label: string; status?: string; icon: React.ElementType }[] = [
  { key: "review", label: "In review", status: "review", icon: Clock },
  { key: "approved", label: "Live", status: "approved", icon: CheckCircle },
  { key: "rejected", label: "Rejected", status: "rejected", icon: XCircle },
  { key: "sold", label: "Sold", status: "sold out", icon: ShoppingBag },
  { key: "expired", label: "Expired", status: "expired", icon: Hourglass },
  { key: "all", label: "All", icon: Layers },
];
const BADGE: Record<string, { label: string; cls: string }> = {
  review: { label: "In review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Live", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  "sold out": { label: "Sold", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  expired: { label: "Expired", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};
const REASONS = [
  "Photos don't match the ad",
  "Price looks fake or misleading",
  "Duplicate of another ad",
  "Wrong category",
  "Phone number or links in the text",
  "Item not allowed on the site",
];
type Action = "approve" | "reject" | "sold" | "delete";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "—");
const price = (r: Row) => (r.priceMode === "free" ? "Free" : r.priceMode === "contact" || r.price == null ? "Contact" : `Rs ${r.price.toLocaleString("en-PK")}`);

function ListingsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const seller = sp.get("seller") || "";

  const [tab, setTab] = useState<TabKey>((sp.get("status") as TabKey) || (seller ? "all" : "review"));
  const [q, setQ] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [sellerInfo, setSellerInfo] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ status: tab, page: String(page), limit: "30" });
    if (q.trim()) p.set("q", q.trim());
    if (seller) p.set("seller", seller);
    if (flagged) p.set("flagged", "1");
    if (sort) p.set("sort", sort);
    return p.toString();
  }, [tab, page, q, seller, flagged, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(withBasePath(`/api/admin/listings?${query}`));
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
      setRows(j.data);
      setTotal(j.total);
      setPages(j.pages);
      setCounts(j.counts || {});
      setSellerInfo(j.seller || null);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message || "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load, reloadKey]);

  async function run(ids: string[], action: Action, reason?: string) {
    if (!ids.length) return;
    if (action === "delete" && !window.confirm(`Delete ${ids.length === 1 ? "this ad" : `${ids.length} ads`} permanently, with photos, saves and chats? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/admin/listings"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action, reason }) });
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
      toast.success(j.message);
      setRejecting(null);
      setReloadKey((k) => k + 1);
      window.dispatchEvent(new Event("admin-counts-refresh"));
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const choose = (k: TabKey) => { setTab(k); setPage(1); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r._id));
  const sel = [...selected];

  const actionsFor = (r: Row): Action[] => {
    switch (r.status) {
      case "review": return ["approve", "reject"];
      case "approved": return ["sold", "reject"];
      case "rejected": return ["approve"];
      case "sold out": return ["approve"];
      case "expired": return ["approve"];
      default: return [];
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-content tracking-tight">Listings &amp; Moderation</h1>
        <p className="text-xs text-content-secondary mt-1">Ads the spam check held come first, riskiest at the top, with the reasons — approve or reject in one tap. The seller is notified either way.</p>
      </div>

      {seller && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span>Showing ads by <b>{sellerInfo?.name || "this seller"}</b>{sellerInfo?.email ? ` (${sellerInfo.email})` : ""}</span>
          <button onClick={() => router.replace("/admin/listings")} className="inline-flex items-center gap-1 text-xs font-bold text-primary"><X className="h-3.5 w-3.5" /> All sellers</button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          const c = t.status ? counts[t.status] : Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <button key={t.key} onClick={() => choose(t.key)} className={`shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-bold transition-colors ${on ? "bg-primary text-white shadow-sm shadow-primary/20" : "border border-card-border bg-card hover:bg-surface-secondary text-content"}`}>
              <Icon className="h-4 w-4" />{t.label}
              <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${on ? "bg-white/20" : "bg-surface-secondary text-content-secondary"}`}>{(c || 0).toLocaleString("en-PK")}</span>
            </button>
          );
        })}
        <button onClick={() => setReloadKey((k) => k + 1)} className="ml-auto shrink-0 inline-flex items-center gap-2 h-10 px-3 rounded-xl text-sm font-bold border border-card-border bg-card hover:bg-surface-secondary text-content" aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="bg-card border border-card-border rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-secondary" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Ad title, link or ID…" className="w-full bg-surface-secondary border border-card-border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none text-content focus:border-primary" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-content shrink-0">
          <input type="checkbox" checked={flagged} onChange={(e) => { setFlagged(e.target.checked); setPage(1); }} />
          Flagged by the spam check
        </label>
        <select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="bg-surface-secondary border border-card-border rounded-xl px-3 py-2.5 text-sm text-content outline-none focus:border-primary">
          <option value="">{tab === "review" ? "Riskiest first" : "Newest first"}</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="risk">Riskiest first</option>
          <option value="views">Most viewed</option>
          <option value="price">Highest price</option>
        </select>
      </div>

      {sel.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card shadow-lg px-4 py-3">
          <span className="text-sm font-bold text-content mr-2">{sel.length} selected</span>
          <button disabled={busy} onClick={() => run(sel, "approve")} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50"><CheckCircle className="h-4 w-4" /> Approve</button>
          <button disabled={busy} onClick={() => setRejecting(sel)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-card-border text-danger text-xs font-bold disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject…</button>
          <button disabled={busy} onClick={() => run(sel, "delete")} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-danger/40 text-danger text-xs font-bold disabled:opacity-50"><Trash2 className="h-4 w-4" /> Delete</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs font-bold text-content-secondary hover:text-content">Clear</button>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-card-border">
          <h2 className="text-sm font-bold text-content flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" />{TABS.find((t) => t.key === tab)?.label} ads</h2>
          <span className="text-xs font-bold text-content-secondary">{total.toLocaleString("en-PK")} total{pages > 1 ? ` · page ${page} of ${pages}` : ""}</span>
        </div>

        {loading && !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
            <Inbox className="h-12 w-12 text-content-secondary/50" />
            <span className="text-sm font-bold text-content">Nothing here</span>
            <span className="text-xs text-content-secondary max-w-xs">{tab === "review" ? "No ads are waiting for review." : "No ads match."}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-xs text-content-secondary font-bold uppercase tracking-wider border-b border-card-border">
                  <th className="py-3 pl-5 pr-2 w-8"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r._id)))} /></th>
                  <th className="py-3 px-3">Ad</th>
                  <th className="py-3 px-3">Seller</th>
                  <th className="py-3 px-3">Performance</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50 text-content">
                {rows.map((r) => (
                  <tr key={r._id} className={`align-top hover:bg-surface-secondary/30 transition-colors ${selected.has(r._id) ? "bg-primary/5" : ""}`}>
                    <td className="py-4 pl-5 pr-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r._id)} onChange={() => toggle(r._id)} /></td>
                    <td className="py-4 px-3 min-w-[280px]">
                      <div className="flex gap-3">
                        <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-surface-secondary border border-card-border flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {r.image ? <img src={r.image} alt="" className="h-full w-full object-cover" /> : <ClipboardList className="h-5 w-5 text-content-secondary/40" />}
                        </div>
                        <div className="min-w-0">
                          <a href={withBasePath(`/ads/${r.slug}`)} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-primary hover:underline inline-flex items-center gap-1 max-w-[300px]">
                            <span className="truncate">{r.name}</span><ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                          </a>
                          <div className="text-xs text-content-secondary mt-0.5">
                            <span className="font-bold text-primary">{price(r)}</span> · {r.category || "Uncategorized"}{r.city ? ` · ${r.city}` : ""} · {r.photos} photo{r.photos === 1 ? "" : "s"}
                          </div>
                          {(r.spamScore > 0 || r.flagReasons.length > 0) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.spamScore > 0 && <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-bold border ${r.spamScore >= 55 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}><AlertTriangle className="h-3 w-3" />Risk {r.spamScore}</span>}
                              {r.flagReasons.slice(0, 4).map((f) => <span key={f} className="rounded px-1.5 py-0.5 text-[12px] font-semibold bg-surface-secondary border border-card-border text-content-secondary">{f}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-3 min-w-[170px]">
                      {r.seller ? (
                        <>
                          <Link href={`/admin/users?q=${encodeURIComponent(r.seller.email)}`} className="font-semibold hover:text-primary flex items-center gap-1">
                            <span className="truncate max-w-[150px]">{r.seller.shop || r.seller.name}</span>
                            {r.seller.verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label="ID verified" />}
                            {r.seller.blocked && <Ban className="h-3.5 w-3.5 text-danger shrink-0" aria-label="Blocked" />}
                          </Link>
                          <div className="text-xs text-content-secondary">{r.seller.phone || r.seller.email}</div>
                          <div className="text-[12px] text-content-secondary">Member since {fmtDate(r.seller.since)}</div>
                          {!seller && <Link href={`/admin/listings?seller=${r.seller._id}`} className="text-[12px] font-bold text-primary hover:underline">Their ads</Link>}
                        </>
                      ) : <span className="text-content-secondary">Unknown</span>}
                    </td>
                    <td className="py-4 px-3 text-xs text-content-secondary whitespace-nowrap">
                      <div className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{r.views.toLocaleString("en-PK")} views</div>
                      <div className="flex items-center gap-1"><PhoneCall className="h-3.5 w-3.5" />{r.leads.toLocaleString("en-PK")} leads</div>
                      {r.featured && <div className="flex items-center gap-1 text-amber-600 font-bold"><Star className="h-3.5 w-3.5" />Boosted</div>}
                    </td>
                    <td className="py-4 px-3 whitespace-nowrap">
                      <span className={`inline-block rounded px-2 py-1 text-xs font-bold border ${BADGE[r.status]?.cls || ""}`}>{r.blockHidden ? "Hidden (seller blocked)" : BADGE[r.status]?.label || r.status}</span>
                      {r.isDemo && <span className="ml-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold border border-card-border text-content-secondary">Demo</span>}
                      <div className="text-[12px] text-content-secondary mt-1">Posted {fmtDate(r.createdAt)}</div>
                      {r.status === "approved" && r.expiresAt && <div className="text-[12px] text-content-secondary">Expires {fmtDate(r.expiresAt)}</div>}
                      {r.status === "expired" && r.expiresAt && <div className="text-[12px] text-content-secondary">Expired {fmtDate(r.expiresAt)}</div>}
                      {r.status === "sold out" && r.soldAt && <div className="text-[12px] text-content-secondary">Sold {fmtDate(r.soldAt)}</div>}
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {actionsFor(r).map((a) => a === "approve" ? (
                          <button key={a} disabled={busy} onClick={() => run([r._id], "approve")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary-dark text-white disabled:opacity-50"><CheckCircle className="h-3.5 w-3.5" />{r.status === "review" ? "Approve" : "Make live"}</button>
                        ) : a === "reject" ? (
                          <button key={a} disabled={busy} onClick={() => setRejecting([r._id])} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-card-border hover:bg-surface-secondary text-danger disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Reject</button>
                        ) : (
                          <button key={a} disabled={busy} onClick={() => window.confirm(`Mark "${r.name}" as sold?`) && run([r._id], "sold")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-card-border hover:bg-surface-secondary text-content disabled:opacity-50"><Tag className="h-3.5 w-3.5" />Sold</button>
                        ))}
                        <button disabled={busy} onClick={() => run([r._id], "delete")} className="inline-flex items-center justify-center h-8 w-8 rounded-xl border border-card-border hover:bg-danger/10 text-danger disabled:opacity-50" aria-label={`Delete ${r.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-card-border">
            <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <span className="text-sm text-content-secondary tabular-nums">{page} / {pages}</span>
            <button disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <RejectDialog ids={rejecting} busy={busy} onClose={() => setRejecting(null)} onReject={(ids, reason) => run(ids, "reject", reason)} />
    </div>
  );
}

function RejectDialog({ ids, busy, onClose, onReject }: { ids: string[] | null; busy: boolean; onClose: () => void; onReject: (ids: string[], reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (ids) setReason(""); }, [ids]);
  return (
    <Modal open={!!ids} onClose={onClose} title={ids && ids.length > 1 ? `Reject ${ids.length} ads` : "Reject ad"} size="sm">
      {ids && (
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-content-secondary">The seller is told the reason, so they can fix the ad and post it again.</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${reason === r ? "bg-primary border-primary text-white" : "border-card-border text-content hover:border-primary"}`}>{r}</button>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Or write a reason…" className="bg-surface-secondary border border-card-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-10 px-4 rounded-lg border border-card-border text-sm font-semibold">Cancel</button>
            <button disabled={busy} onClick={() => onReject(ids, reason)} className="h-10 px-4 rounded-lg bg-danger text-white text-sm font-bold disabled:opacity-50">{busy ? "Rejecting…" : "Reject"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminListingsPage() {
  return <Suspense fallback={null}><ListingsPage /></Suspense>;
}
