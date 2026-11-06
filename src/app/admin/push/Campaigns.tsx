"use client";

/** Manual campaigns: history with results, and the way in to the composer. */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Send, Copy, Trash2, Ban } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Pill, card, btnPrimary, jsonFetch, fmt, pct, when } from "./ui";

export function Campaigns() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = async () => {
    const j = await jsonFetch("/api/admin/push/campaigns");
    if (j.success) setItems(j.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  // While something is sending, keep the numbers moving.
  useEffect(() => {
    if (!items.some((c) => c.status === "sending" || c.status === "scheduled")) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [items]);

  const act = async (id: string, action: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(id);
    const j = action === "delete"
      ? await jsonFetch(`/api/admin/push/campaigns/${id}`, { method: "DELETE" })
      : await jsonFetch(`/api/admin/push/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    setBusy("");
    if (j.success) toast.success(j.message || "Done"); else toast.error(j.message || "Failed");
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-content-secondary max-w-2xl">Write a notification once and send it to everyone — or to one city, phones only, sellers, buyers, or people you pick.</p>
        <Link href="/admin/push/compose" className={btnPrimary}><Plus className="h-4 w-4" /> New campaign</Link>
      </div>

      {items.length === 0 ? (
        <div className={`${card} text-center py-12`}>
          <Send className="h-8 w-8 text-content-tertiary mx-auto mb-3" />
          <p className="font-semibold text-content">No campaigns yet</p>
          <p className="text-sm text-content-secondary mt-1">Your first one could tell Lahore buyers about this week&apos;s arrivals.</p>
        </div>
      ) : (
        <div className={`${card} !p-0 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead><tr className="text-[12px] uppercase tracking-wider text-content-tertiary text-left border-b border-card-border">
              <th className="p-3 font-bold">Campaign</th><th className="font-bold">Status</th><th className="font-bold">Audience</th>
              <th className="font-bold">Sent</th><th className="font-bold">Shown</th><th className="font-bold">Tapped</th><th className="font-bold">When</th><th />
            </tr></thead>
            <tbody className="divide-y divide-card-border/60">
              {items.map((c) => (
                <tr key={c._id} className="hover:bg-surface-secondary/60">
                  <td className="p-3">
                    <Link href={`/admin/push/campaigns/${c._id}`} className="font-semibold text-content hover:text-primary block truncate max-w-[240px]">{c.name || c.title}</Link>
                    <span className="text-[12px] text-content-tertiary block truncate max-w-[240px]">{c.title}</span>
                  </td>
                  <td>
                    <Pill status={c.status} />
                    {c.status === "sending" && <span className="block text-[12px] text-content-tertiary mt-1 tabular-nums">{fmt(c.stats?.sent)} / {fmt(c.stats?.targeted)}</span>}
                  </td>
                  <td className="capitalize text-content-secondary">{c.audience?.who || "all"}</td>
                  <td className="tabular-nums">{fmt(c.stats?.sent)}</td>
                  <td className="tabular-nums">{fmt(c.stats?.delivered)}</td>
                  <td className="tabular-nums">{fmt(c.stats?.clicked)} <span className="text-content-tertiary">({pct(c.stats?.clicked || 0, c.stats?.delivered || c.stats?.sent || 0)})</span></td>
                  <td className="text-content-secondary whitespace-nowrap">{when(c.finishedAt || c.sendAt || c.createdAt)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 justify-end">
                      {busy === c._id && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {(c.status === "draft" || c.status === "failed") && (
                        <button title="Send now" onClick={() => act(c._id, "send", "Send this campaign now?")} className="p-2 rounded-lg hover:bg-surface-secondary text-primary"><Send className="h-4 w-4" /></button>
                      )}
                      {(c.status === "scheduled" || c.status === "sending") && (
                        <button title="Stop" onClick={() => act(c._id, "cancel", "Stop this campaign?")} className="p-2 rounded-lg hover:bg-surface-secondary text-amber-600"><Ban className="h-4 w-4" /></button>
                      )}
                      <button title="Duplicate" onClick={() => act(c._id, "duplicate")} className="p-2 rounded-lg hover:bg-surface-secondary text-content-secondary"><Copy className="h-4 w-4" /></button>
                      {c.status !== "sending" && (
                        <button title="Delete" onClick={() => act(c._id, "delete", "Delete this campaign?")} className="p-2 rounded-lg hover:bg-surface-secondary text-danger"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
