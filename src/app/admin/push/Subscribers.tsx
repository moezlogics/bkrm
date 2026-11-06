"use client";

/** Who is subscribed: search and filter every device, and remove any of them. */
import React, { useEffect, useState } from "react";
import { Loader2, Search, Trash2, Smartphone, Tablet, Monitor } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Pill, card, input, btnGhost, jsonFetch, fmt, when } from "./ui";

const ICON: Record<string, React.ElementType> = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

export function Subscribers({ options }: { options: any }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ status: "active", who: "", city: "", device: "", q: "", page: 1 });

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    const j = await jsonFetch(`/api/admin/push/subscribers?${qs}`);
    if (j.success) { setRows(j.data); setMeta({ total: j.total, page: j.page, pages: j.pages }); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [f]);

  const remove = async (id: string) => {
    if (!window.confirm("Stop sending notifications to this device?")) return;
    const j = await jsonFetch(`/api/admin/push/subscribers?id=${id}`, { method: "DELETE" });
    j.success ? toast.success("Removed") : toast.error(j.message || "Failed");
    load();
  };
  const set = (patch: any) => setF((x) => ({ ...x, ...patch, page: patch.page || 1 }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
          <input className={`${input} pl-9`} placeholder="Search by name or email…" defaultValue={f.q}
            onKeyDown={(e) => e.key === "Enter" && set({ q: (e.target as HTMLInputElement).value })} />
        </div>
        <select className={`${input} !w-auto`} value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="active">Active</option><option value="unsubscribed">Turned off</option>
          <option value="expired">Expired</option><option value="invalid">Rejected</option><option value="all">All</option>
        </select>
        <select className={`${input} !w-auto`} value={f.who} onChange={(e) => set({ who: e.target.value })}>
          <option value="">Everyone</option><option value="users">Signed in</option><option value="guests">Guests</option><option value="sellers">Sellers</option>
        </select>
        <select className={`${input} !w-auto`} value={f.city} onChange={(e) => set({ city: e.target.value })}>
          <option value="">All cities</option>
          {(options?.cities || []).filter((c: any) => c.n > 0).map((c: any) => <option key={c.id} value={c.name}>{c.name} ({c.n})</option>)}
        </select>
        <select className={`${input} !w-auto`} value={f.device} onChange={(e) => set({ device: e.target.value })}>
          <option value="">Any device</option><option value="mobile">Phone</option><option value="tablet">Tablet</option><option value="desktop">Computer</option>
        </select>
      </div>

      <div className={`${card} !p-0 overflow-x-auto`}>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-content-secondary text-center py-16">No devices match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-[12px] uppercase tracking-wider text-content-tertiary text-left border-b border-card-border">
              <th className="p-3 font-bold">Person</th><th className="font-bold">Where</th><th className="font-bold">Device</th>
              <th className="font-bold">Subscribed</th><th className="font-bold">Last seen</th><th className="font-bold">Sent</th><th className="font-bold">Tapped</th><th className="font-bold">Status</th><th />
            </tr></thead>
            <tbody className="divide-y divide-card-border/60">
              {rows.map((s) => {
                const Icon = ICON[s.device] || Monitor;
                return (
                  <tr key={s._id} className="hover:bg-surface-secondary/60">
                    <td className="p-3">
                      <span className="block font-semibold text-content">{s.userId?.name || "Guest"}</span>
                      <span className="block text-[12px] text-content-tertiary">{s.userId?.email || (s.isSeller ? "seller" : "not signed in")}</span>
                    </td>
                    <td className="text-content-secondary">{[s.area, s.city, s.state].filter(Boolean).join(", ") || "—"}</td>
                    <td><span className="inline-flex items-center gap-1.5 text-content-secondary"><Icon className="h-3.5 w-3.5" /> {s.browser} · {s.os}</span></td>
                    <td className="text-content-secondary whitespace-nowrap">{when(s.createdAt)}</td>
                    <td className="text-content-secondary whitespace-nowrap">{when(s.lastSeenAt)}</td>
                    <td className="tabular-nums">{fmt(s.sentCount)}</td>
                    <td className="tabular-nums">{fmt(s.clickCount)}</td>
                    <td><Pill status={s.status} /></td>
                    <td className="p-3 text-right">
                      {s.status === "active" && (
                        <button onClick={() => remove(s._id)} title="Remove" className="p-2 rounded-lg hover:bg-surface-secondary text-danger"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-content-secondary">{fmt(meta.total)} device{meta.total === 1 ? "" : "s"}</span>
        {meta.pages > 1 && (
          <div className="flex items-center gap-2">
            <button disabled={meta.page <= 1} onClick={() => set({ page: meta.page - 1 })} className={`${btnGhost} !py-1.5 !px-3 text-xs`}>Previous</button>
            <span className="text-xs text-content-secondary">Page {meta.page} of {meta.pages}</span>
            <button disabled={meta.page >= meta.pages} onClick={() => set({ page: meta.page + 1 })} className={`${btnGhost} !py-1.5 !px-3 text-xs`}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
