"use client";

/** One campaign: live progress while it sends, then its results. */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send, Ban, Copy, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Stat, Pill, card, btnPrimary, btnGhost, jsonFetch, fmt, pct, when } from "../../ui";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [c, setC] = useState<any>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const j = await jsonFetch(`/api/admin/push/campaigns/${id}`);
    setC(j.success ? j.data : null);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!c || !["sending", "scheduled"].includes(c.status)) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [c, load]);

  const act = async (action: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    const j = action === "delete"
      ? await jsonFetch(`/api/admin/push/campaigns/${id}`, { method: "DELETE" })
      : await jsonFetch(`/api/admin/push/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    setBusy("");
    if (!j.success) return toast.error(j.message || "Failed");
    toast.success(j.message);
    if (action === "delete") return router.push("/admin/push?tab=campaigns");
    if (action === "duplicate" && j.data?._id) return router.push(`/admin/push/compose?id=${j.data._id}`);
    load();
  };

  if (!c) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>;
  const s = c.stats || {};
  const progress = s.targeted ? Math.min(100, Math.round(((s.sent + s.failed + s.removed) / s.targeted) * 100)) : 0;
  const a = c.audience || { who: "all" };
  const bits = [
    a.who === "all" ? "everyone" : a.who,
    a.cityIds?.length ? `${a.cityIds.length} city/cities` : "",
    a.states?.length ? a.states.join(", ") : "",
    a.devices?.length ? a.devices.join(", ") : "",
    a.browsers?.length ? a.browsers.join(", ") : "",
    a.activeWithinDays ? `active in ${a.activeWithinDays} days` : "",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 flex-wrap">
        <Link href="/admin/push?tab=campaigns" className="p-2 rounded-lg hover:bg-surface-secondary text-content-secondary"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-content tracking-tight">{c.name || c.title}</h1>
            <Pill status={c.status} />
          </div>
          <p className="text-xs text-content-secondary mt-1">
            {c.status === "scheduled" ? `Scheduled for ${when(c.sendAt)}` : c.status === "sent" ? `Finished ${when(c.finishedAt)}` : c.status === "sending" ? "Sending now…" : `Created ${when(c.createdAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {["draft", "failed"].includes(c.status) && <button onClick={() => act("send", "Send this campaign now?")} className={btnPrimary}>{busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send now</button>}
          {["draft", "scheduled"].includes(c.status) && <Link href={`/admin/push/compose?id=${c._id}`} className={btnGhost}><Pencil className="h-4 w-4" /> Edit</Link>}
          {["scheduled", "sending"].includes(c.status) && <button onClick={() => act("cancel", "Stop this campaign?")} className={btnGhost}><Ban className="h-4 w-4" /> Stop</button>}
          <button onClick={() => act("duplicate")} className={btnGhost}><Copy className="h-4 w-4" /> Duplicate</button>
          {c.status !== "sending" && <button onClick={() => act("delete", "Delete this campaign?")} className={`${btnGhost} !text-danger`}><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>

      {c.error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{c.error}</p>}

      {c.status === "sending" && (
        <div className={card}>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold text-content">Sending…</span>
            <span className="text-content-secondary tabular-nums">{fmt(s.sent + s.failed + s.removed)} of {fmt(s.targeted)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-secondary overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Audience" value={fmt(s.targeted)} hint="devices" />
        <Stat label="Sent" value={fmt(s.sent)} />
        <Stat label="Shown" value={fmt(s.delivered)} hint={pct(s.delivered || 0, s.sent || 0)} />
        <Stat label="Tapped" value={fmt(s.clicked)} hint={pct(s.clicked || 0, s.delivered || s.sent || 0)} />
        <Stat label="Dropped" value={fmt((s.failed || 0) + (s.removed || 0))} hint={`${fmt(s.removed)} dead devices`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={card}>
          <h2 className="text-sm font-bold text-content mb-3">The notification</h2>
          <div className="rounded-2xl bg-slate-100 p-3">
            <div className="rounded-xl bg-white shadow-sm p-3">
              <div className="flex items-start gap-2.5">
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                ) : <span className="h-8 w-8 rounded-lg bg-primary/10 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 break-words">{c.title}</p>
                  <p className="text-xs text-slate-600 break-words">{c.body}</p>
                </div>
              </div>
              {c.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt="" className="mt-2 w-full rounded-lg object-cover max-h-32" />
              )}
            </div>
          </div>
          <p className="text-xs text-content-secondary mt-3">Opens <span className="font-mono text-content">{c.url}</span></p>
        </div>
        <div className={card}>
          <h2 className="text-sm font-bold text-content mb-3">Audience</h2>
          <p className="text-sm text-content-secondary capitalize">{bits.join(" · ")}</p>
          {a.userIds?.length > 0 && <p className="text-sm text-content-secondary mt-1">{a.userIds.length} chosen people</p>}
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
            <dt className="text-content-tertiary">Priority</dt><dd className="text-content font-semibold capitalize">{c.urgency}</dd>
            <dt className="text-content-tertiary">Keep trying for</dt><dd className="text-content font-semibold">{c.ttlHours} hours</dd>
            <dt className="text-content-tertiary">Created</dt><dd className="text-content font-semibold">{when(c.createdAt)}</dd>
            <dt className="text-content-tertiary">Started</dt><dd className="text-content font-semibold">{when(c.startedAt)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
