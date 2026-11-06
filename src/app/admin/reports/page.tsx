"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Flag, Trash2, Plus, Loader2, ShieldAlert, ListChecks, ExternalLink, CheckCircle, XCircle, Ban, EyeOff,
  Users as UsersIcon, RotateCcw, BadgeCheck, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

interface Person { _id: string; name?: string; email?: string; isBlocked?: boolean; verificationLevel?: number; openReports?: number }
interface Report {
  _id: string;
  type: "listing" | "seller";
  status: "open" | "reviewed" | "dismissed";
  reportReasonId?: { reason?: string } | null;
  userId?: Person | null;
  itemId?: { _id: string; name?: string; slug?: string; status?: string; mainImage?: string; galleryImages?: string[] } | null;
  seller?: Person | null;
  otherMessage?: string | null;
  reason?: string | null;
  createdAt?: string;
}
interface SellerRow {
  sellerId: string;
  seller: { name?: string; email?: string; phoneNumber?: string; isBlocked?: boolean; verificationLevel?: number; isShop?: boolean; shopName?: string; createdAt?: string } | null;
  open: number;
  reporters: number;
  ads: number;
  last: string;
  reasons: { reason: string; n: number }[];
}
interface Reason { _id: string; reason: string }

type View = "open" | "reviewed" | "dismissed" | "all" | "sellers";
const VIEWS: { key: View; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "sellers", label: "By seller" },
  { key: "reviewed", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "—");

async function patch(body: Record<string, unknown>) {
  const res = await fetch(withBasePath("/api/admin/reports"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.success) throw new Error(j.message || "Action failed");
  return j;
}

function ReportsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const seller = sp.get("seller") || "";

  const [view, setView] = useState<View>(seller ? "all" : "open");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState<Report[]>([]);
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [newReason, setNewReason] = useState("");
  const [addingReason, setAddingReason] = useState(false);
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "sellers") {
        const j = await fetch(withBasePath("/api/admin/reports?view=sellers")).then((r) => r.json());
        if (!j.success) throw new Error(j.message);
        setSellers(j.data);
        setTotal(j.total);
      } else {
        const p = new URLSearchParams({ status: view, page: String(page) });
        if (seller) p.set("seller", seller);
        const j = await fetch(withBasePath(`/api/admin/reports?${p}`)).then((r) => r.json());
        if (!j.success) throw new Error(j.message);
        setReports(j.data);
        setTotal(j.total);
        setOpen(j.open);
        setPages(j.pages);
      }
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [view, page, seller, toast]);

  useEffect(() => { void load(); }, [load, reload]);

  const loadReasons = useCallback(async () => {
    const j = await fetch(withBasePath("/api/admin/report-reasons")).then((r) => r.json()).catch(() => null);
    if (j?.success) setReasons(j.data || []);
  }, []);
  useEffect(() => { void loadReasons(); }, [loadReasons]);

  async function act(ids: string[], action: "resolve" | "dismiss" | "reopen", extra: Record<string, unknown> = {}, confirmMsg?: string) {
    if (!ids.length || (confirmMsg && !window.confirm(confirmMsg))) return;
    setBusy(true);
    try {
      const j = await patch({ ids, action, ...extra });
      toast.success(j.message);
      setReload((k) => k + 1);
      window.dispatchEvent(new Event("admin-counts-refresh"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function blockFromSellerRow(row: SellerRow) {
    if (!window.confirm(`Block ${row.seller?.name || "this seller"} and hide their live ads? All ${row.open} open reports about them are resolved.`)) return;
    setBusy(true);
    try {
      const j = await fetch(withBasePath(`/api/admin/reports?status=open&seller=${row.sellerId}&limit=100`)).then((r) => r.json());
      const ids = (j.data || []).map((r: Report) => r._id);
      const res = await patch({ ids, action: "resolve", blockSeller: true, note: `Reported by ${row.reporters} buyers` });
      toast.success(res.message);
      setReload((k) => k + 1);
      window.dispatchEvent(new Event("admin-counts-refresh"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addReason(e: React.FormEvent) {
    e.preventDefault();
    const value = newReason.trim();
    if (!value) return toast.error("Enter a reason first");
    setAddingReason(true);
    try {
      const j = await fetch(withBasePath("/api/admin/report-reasons"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: value }) }).then((r) => r.json());
      if (!j.success) throw new Error(j.message);
      toast.success("Reason added");
      setNewReason("");
      void loadReasons();
    } catch (err: any) { toast.error(err.message || "Failed to add reason"); } finally { setAddingReason(false); }
  }

  async function deleteReason(r: Reason) {
    if (!window.confirm(`Delete the reason "${r.reason}"?`)) return;
    const j = await fetch(withBasePath("/api/admin/report-reasons"), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reasonId: r._id }) }).then((x) => x.json()).catch(() => null);
    if (j?.success) { toast.success("Reason deleted"); setReasons((p) => p.filter((x) => x._id !== r._id)); } else toast.error(j?.message || "Failed to delete reason");
  }

  const reasonOf = (r: Report) => r.reportReasonId?.reason || r.reason || "Not specified";
  const sel = [...selected];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const btn = "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-content tracking-tight">Reports</h1>
        <p className="text-xs text-content-secondary mt-1">One complaint is an argument; several about the same seller is a decision. Reports are kept, and counted per seller across their ads.</p>
      </div>

      {seller && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span>Reports about one seller</span>
          <button onClick={() => router.replace("/admin/reports")} className="inline-flex items-center gap-1 text-xs font-bold text-primary"><X className="h-3.5 w-3.5" /> All reports</button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => { setView(v.key); setPage(1); }} className={`shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-bold transition-colors ${view === v.key ? "bg-primary text-white" : "border border-card-border bg-card hover:bg-surface-secondary text-content"}`}>
            {v.key === "sellers" ? <UsersIcon className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
            {v.label}
            {v.key === "open" && open != null && <span className={`rounded-full px-2 py-0.5 text-xs ${view === "open" ? "bg-white/20" : "bg-rose-50 text-rose-600"}`}>{open}</span>}
          </button>
        ))}
      </div>

      {sel.length > 0 && view !== "sellers" && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card shadow-lg px-4 py-3">
          <span className="text-sm font-bold mr-2">{sel.length} selected</span>
          <button disabled={busy} onClick={() => act(sel, "resolve")} className={`${btn} border-card-border text-content`}><CheckCircle className="h-3.5 w-3.5" /> Resolve</button>
          <button disabled={busy} onClick={() => act(sel, "dismiss")} className={`${btn} border-card-border text-content-secondary`}><XCircle className="h-3.5 w-3.5" /> Dismiss</button>
          <button disabled={busy} onClick={() => act(sel, "resolve", { hideAd: true }, "Take the reported ads down?")} className={`${btn} border-danger/40 text-danger`}><EyeOff className="h-3.5 w-3.5" /> Take ads down</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs font-bold text-content-secondary">Clear</button>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : view === "sellers" ? (
          sellers.length === 0 ? (
            <Empty title="No open reports" body="Sellers with open reports against them appear here, most-reported first." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Seller</th><th className="py-3 px-4">Open reports</th><th className="py-3 px-4">Top reasons</th><th className="py-3 px-4">Last</th><th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border/50">
                  {sellers.map((s) => (
                    <tr key={s.sellerId} className="align-top hover:bg-surface-secondary/30">
                      <td className="py-4 px-4">
                        <Link href={`/admin/users?q=${encodeURIComponent(s.seller?.email || s.sellerId)}`} className="font-semibold hover:text-primary inline-flex items-center gap-1">
                          {s.seller?.isShop ? s.seller.shopName || s.seller.name : s.seller?.name || "Deleted account"}
                          {(s.seller?.verificationLevel || 0) >= 2 && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                        </Link>
                        <div className="text-xs text-content-secondary">{s.seller?.phoneNumber || s.seller?.email}</div>
                        {s.seller?.isBlocked && <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-danger"><Ban className="h-3 w-3" />Blocked</span>}
                      </td>
                      <td className="py-4 px-4">
                        <div className={`text-lg font-bold ${s.reporters >= 3 ? "text-danger" : "text-content"}`}>{s.open}</div>
                        <div className="text-xs text-content-secondary">from {s.reporters} {s.reporters === 1 ? "person" : "people"} · {s.ads} ad{s.ads === 1 ? "" : "s"}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">{s.reasons.map((r) => <span key={r.reason} className="rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">{r.reason} ×{r.n}</span>)}</div>
                      </td>
                      <td className="py-4 px-4 text-xs text-content-secondary whitespace-nowrap">{fmtDate(s.last)}</td>
                      <td className="py-4 px-4">
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          <Link href={`/admin/reports?seller=${s.sellerId}`} onClick={() => setView("all")} className={`${btn} border-card-border text-content`}>Reports</Link>
                          <Link href={`/admin/listings?seller=${s.sellerId}`} className={`${btn} border-card-border text-content`}>Ads</Link>
                          {!s.seller?.isBlocked && <button disabled={busy} onClick={() => blockFromSellerRow(s)} className={`${btn} border-danger/40 text-danger`}><Ban className="h-3.5 w-3.5" /> Block</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : reports.length === 0 ? (
          <Empty title="No reports" body={view === "open" ? "Nothing to review right now." : "No reports here."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 w-8"><input type="checkbox" aria-label="Select all" checked={reports.every((r) => selected.has(r._id))} onChange={() => setSelected(reports.every((r) => selected.has(r._id)) ? new Set() : new Set(reports.map((r) => r._id)))} /></th>
                  <th className="py-3 px-3">Reported</th><th className="py-3 px-3">Reason</th><th className="py-3 px-3">Seller</th><th className="py-3 px-3">By</th><th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50 text-content">
                {reports.map((r) => (
                  <tr key={r._id} className={`align-top hover:bg-surface-secondary/30 ${selected.has(r._id) ? "bg-primary/5" : ""}`}>
                    <td className="py-4 pl-4 pr-2"><input type="checkbox" aria-label="Select report" checked={selected.has(r._id)} onChange={() => toggle(r._id)} /></td>
                    <td className="py-4 px-3 min-w-[220px]">
                      {r.type === "seller" ? (
                        <span className="font-semibold">Seller profile</span>
                      ) : r.itemId?.slug ? (
                        <a href={withBasePath(`/ads/${r.itemId.slug}`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:text-primary hover:underline max-w-[260px]">
                          <span className="truncate">{r.itemId.name || "View listing"}</span><ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : <span className="text-content-secondary">Ad removed</span>}
                      {r.itemId?.status && r.itemId.status !== "approved" && <div className="text-[11px] text-content-secondary mt-0.5">Ad is {r.itemId.status === "sold out" ? "sold" : r.itemId.status}</div>}
                      <div className="text-[11px] text-content-secondary mt-0.5">{fmtDate(r.createdAt)}{r.status !== "open" ? ` · ${r.status === "reviewed" ? "resolved" : r.status}` : ""}</div>
                    </td>
                    <td className="py-4 px-3 max-w-[260px]">
                      <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-1 text-xs font-bold">{reasonOf(r)}</span>
                      {r.otherMessage && <p className="text-xs text-content-secondary mt-1 line-clamp-3">{r.otherMessage}</p>}
                    </td>
                    <td className="py-4 px-3">
                      {r.seller ? (
                        <>
                          <Link href={`/admin/users?q=${encodeURIComponent(r.seller.email || r.seller._id)}`} className="font-semibold hover:text-primary inline-flex items-center gap-1">
                            {r.seller.name}{(r.seller.verificationLevel || 0) >= 2 && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                          </Link>
                          {(r.seller.openReports || 0) > 1 && <div className="text-[11px] font-bold text-danger">{r.seller.openReports} open reports in total</div>}
                          {r.seller.isBlocked && <div className="text-[11px] font-bold text-danger inline-flex items-center gap-1"><Ban className="h-3 w-3" />Blocked</div>}
                        </>
                      ) : <span className="text-content-secondary">—</span>}
                    </td>
                    <td className="py-4 px-3 text-xs">
                      <div className="font-semibold text-content">{r.userId?.name || "Unknown"}</div>
                      <div className="text-content-secondary">{r.userId?.email}</div>
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        {r.status === "open" ? (
                          <>
                            <button disabled={busy} onClick={() => act([r._id], "resolve")} className={`${btn} border-card-border text-content`} title="The problem is handled"><CheckCircle className="h-3.5 w-3.5" /> Resolve</button>
                            <button disabled={busy} onClick={() => act([r._id], "dismiss")} className={`${btn} border-card-border text-content-secondary`} title="Nothing wrong"><XCircle className="h-3.5 w-3.5" /> Dismiss</button>
                            {r.itemId && r.itemId.status === "approved" && <button disabled={busy} onClick={() => act([r._id], "resolve", { hideAd: true }, `Take "${r.itemId?.name}" down? The seller is told why.`)} className={`${btn} border-danger/40 text-danger`}><EyeOff className="h-3.5 w-3.5" /> Take ad down</button>}
                            {r.seller && !r.seller.isBlocked && <button disabled={busy} onClick={() => act([r._id], "resolve", { blockSeller: true, note: `Reported: ${reasonOf(r)}` }, `Block ${r.seller?.name} and hide their live ads?`)} className={`${btn} border-danger/40 text-danger`}><Ban className="h-3.5 w-3.5" /> Block seller</button>}
                          </>
                        ) : (
                          <button disabled={busy} onClick={() => act([r._id], "reopen")} className={`${btn} border-card-border text-content`}><RotateCcw className="h-3.5 w-3.5" /> Reopen</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view !== "sellers" && pages > 1 && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-card-border">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <span className="text-sm text-content-secondary">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-card-border">
          <ListChecks className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-content">Report reasons</h2>
          <span className="text-xs text-content-secondary">— what buyers can choose when they report an ad</span>
        </div>
        <div className="p-6 flex flex-col gap-5">
          <form onSubmit={addReason} className="flex items-center gap-3">
            <input type="text" value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="e.g. Asked for advance payment" className="flex-1 bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary" />
            <button type="submit" disabled={addingReason} className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-3 text-sm disabled:opacity-50 shrink-0">
              {addingReason ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </button>
          </form>
          {reasons.length === 0 ? (
            <p className="text-xs text-content-secondary">No reasons yet — buyers see a built-in list until you add your own.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-card-border/50 border border-card-border rounded-xl overflow-hidden">
              {reasons.map((reason) => (
                <li key={reason._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-content font-medium">{reason.reason}</span>
                  <button onClick={() => deleteReason(reason)} className="text-danger hover:bg-surface-secondary rounded-lg p-2" aria-label={`Delete ${reason.reason}`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-16 flex flex-col items-center justify-center gap-3 text-center">
      <div className="h-14 w-14 rounded-2xl bg-surface-secondary flex items-center justify-center"><ShieldAlert className="h-7 w-7 text-content-secondary" /></div>
      <h3 className="text-base font-bold text-content">{title}</h3>
      <p className="text-xs text-content-secondary max-w-sm">{body}</p>
    </div>
  );
}

export default function AdminReportsPage() {
  return <Suspense fallback={null}><ReportsPage /></Suspense>;
}
