"use client";

/**
 * Admin → Bookings: every qasai and hissa booking — by status and kind,
 * searchable by code, ad, name or number — with how full each day is, and
 * cancelling one when there's a dispute (both sides are told why).
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2, Search, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";
import { STATUS_TEXT } from "@/lib/bookings/shared";

const TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700", confirmed: "bg-emerald-50 text-emerald-700", completed: "bg-blue-50 text-blue-700",
  declined: "bg-red-50 text-red-600", cancelled: "bg-red-50 text-red-600", expired: "bg-slate-100 text-slate-600",
};
const n = (v: number) => Number(v || 0).toLocaleString("en-US");

export default function AdminBookings() {
  const { toast } = useToast();
  const [status, setStatus] = useState("open");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [d, setD] = useState<any>(null);
  const [cancel, setCancel] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setD(null);
    const p = new URLSearchParams({ status, page: String(page) });
    if (kind) p.set("kind", kind);
    if (q.trim()) p.set("q", q.trim());
    const j = await fetch(withBasePath(`/api/admin/bookings?${p}`)).then((r) => r.json()).catch(() => null);
    setD(j?.success ? j : { data: [], counts: {}, byDay: [], total: 0, pages: 1 });
  }, [status, kind, q, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const doCancel = async () => {
    setBusy(true);
    const j = await fetch(withBasePath("/api/admin/bookings"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cancel._id, reason }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (j?.success) { toast.success(j.message); setCancel(null); setReason(""); void load(); } else toast.error(j?.message || "Couldn't cancel");
  };

  const c = d?.counts || {};
  const sel = "h-10 rounded-lg border border-card-border bg-surface px-3 text-sm outline-none focus:border-primary";
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-content flex items-center gap-2"><CalendarCheck className="h-6 w-6 text-primary" /> Bookings</h1>
        <p className="text-xs text-content-secondary mt-1">Qasai and hissa bookings made through the site. Providers confirm them; you step in only when something goes wrong.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {["pending", "confirmed", "completed", "declined", "cancelled", "expired"].map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={`rounded-xl border bg-card p-3 text-left ${status === s ? "border-primary" : "border-card-border"}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-content-tertiary">{STATUS_TEXT[s]}</p>
            <p className="text-xl font-bold text-content tabular-nums">{n(c[s] || 0)}</p>
          </button>
        ))}
      </div>

      {d?.byDay?.length > 0 && (
        <div className="rounded-2xl border border-card-border bg-card p-4">
          <p className="text-sm font-bold text-content mb-2">Open bookings by day</p>
          <div className="flex flex-wrap gap-2">
            {d.byDay.map((x: any) => <span key={x._id} className="rounded-full bg-surface-secondary px-3 py-1 text-xs"><b>{x._id || "No day"}</b> · {n(x.bookings)} bookings · {n(x.units)} animals/shares</span>)}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={sel} aria-label="Status">
          <option value="open">Open (waiting + confirmed)</option>
          <option value="">All</option>
          {Object.entries(STATUS_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className={sel} aria-label="Kind">
          <option value="">Qasai & hissa</option>
          <option value="service">Services (qasai…)</option>
          <option value="share">Hissay</option>
        </select>
        <label className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Code, ad, name or number" className={`${sel} w-full pl-9`} />
        </label>
      </div>

      {!d ? (
        <div className="py-16 grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : d.data.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card p-12 text-center text-sm text-content-secondary">No bookings here.</div>
      ) : (
        <div className="rounded-2xl border border-card-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-content-tertiary border-b border-card-border">
              <tr><th className="px-4 py-2.5">Booking</th><th className="px-4 py-2.5">Day</th><th className="px-4 py-2.5">What</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Provider</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {d.data.map((b: any) => (
                <tr key={b._id} className="align-top">
                  <td className="px-4 py-3"><p className="font-mono text-xs font-bold">{b.code}</p><a href={withBasePath(`/ads/${b.listingSlug}`)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline line-clamp-1">{b.listingName}</a></td>
                  <td className="px-4 py-3 text-xs">{b.dayLabel}{b.slotLabel ? <span className="block text-content-tertiary">{b.slotLabel}</span> : null}</td>
                  <td className="px-4 py-3 text-xs">{b.kind === "share" ? `${b.shares} hissay` : b.units.map((u: any) => `${u.count} × ${u.label}`).join(", ")}{b.estimate != null ? <span className="block text-content-tertiary">Rs {n(b.estimate)}</span> : null}</td>
                  <td className="px-4 py-3 text-xs">{b.customer ? <Link href={`/admin/users/${b.customer.id}`} className="font-semibold hover:text-primary">{b.contactName}</Link> : b.contactName}<span className="block text-content-tertiary">{b.phone}{b.area ? ` · ${b.area}` : ""}</span></td>
                  <td className="px-4 py-3 text-xs">{b.provider ? <Link href={`/admin/users/${b.provider.id}`} className="font-semibold hover:text-primary">{b.provider.name}</Link> : "—"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE[b.status]}`}>{STATUS_TEXT[b.status]}</span>{b.reason ? <span className="block text-[11px] text-content-tertiary mt-1">{b.reason}</span> : null}</td>
                  <td className="px-4 py-3 text-right">{["pending", "confirmed"].includes(b.status) && <button onClick={() => { setCancel(b); setReason(""); }} className="text-xs font-bold text-danger hover:underline">Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d && d.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-9 px-3 rounded-lg border border-card-border text-sm disabled:opacity-40">Previous</button>
          <span className="text-sm text-content-secondary">Page {page} of {d.pages}</span>
          <button disabled={page >= d.pages} onClick={() => setPage((p) => p + 1)} className="h-9 px-3 rounded-lg border border-card-border text-sm disabled:opacity-40">Next</button>
        </div>
      )}

      {cancel && (
        <div className="fixed inset-0 z-[90] grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/55" onClick={() => setCancel(null)} />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-2xl border border-card-border bg-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between"><h3 className="font-bold text-content">Cancel {cancel.code}</h3><button onClick={() => setCancel(null)} aria-label="Close"><X className="h-5 w-5" /></button></div>
            <p className="text-[13px] text-content-secondary">Both {cancel.contactName} and {cancel.provider?.name || "the provider"} get a notification with your reason.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="Reason" className="w-full rounded-xl border border-card-border px-3 py-2.5 text-sm outline-none bg-surface focus:border-primary" />
            <button onClick={doCancel} disabled={busy || !reason.trim()} className="h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Cancel booking"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
