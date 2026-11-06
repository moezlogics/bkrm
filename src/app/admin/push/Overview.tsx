"use client";

/** Push dashboard: who is subscribed, where they are, and what reaches them. */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { TrendChart, BarList, SERIES } from "@/components/admin/push/PushCharts";
import { Stat, Pill, card, btnGhost, jsonFetch, fmt, pct, when } from "./ui";

const TYPE_LABELS: Record<string, string> = { campaign: "Manual campaigns", test: "Test sends" };

export function Overview({ types }: { types: { id: string; label: string }[] }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const j = await jsonFetch("/api/admin/push/overview");
    if (j.success) setD(j.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading && !d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>;
  if (!d) return <p className="text-sm text-content-secondary">Couldn&apos;t load the dashboard.</p>;
  const t = d.totals;
  const label = (id: string) => TYPE_LABELS[id] || types.find((x) => x.id === id)?.label || id;

  return (
    <div className="flex flex-col gap-5">
      {!d.vapid && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Push keys are missing, so nothing can be sent. Add <b>VAPID_PUBLIC_KEY</b> and <b>VAPID_PRIVATE_KEY</b> to the server environment (see Settings).</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Devices subscribed" value={fmt(t.active)} hint={`${fmt(t.users)} signed in · ${fmt(t.guests)} guests`} />
        <Stat label="New today" value={fmt(t.new1)} hint={`${fmt(t.new7)} this week · ${fmt(t.new30)} this month`} />
        <Stat label="Sellers / buyers" value={`${fmt(t.sellers)} / ${fmt(t.buyers)}`} hint="signed-in devices" />
        <Stat label="Lost (30 days)" value={fmt(t.lost30)} hint="turned off, expired or replaced" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className={card}>
          <h2 className="text-sm font-bold text-content mb-3">Subscribers — last 30 days</h2>
          <TrendChart
            days={d.growth.map((g: any) => g.day)}
            series={[
              { name: "New", color: SERIES[0], points: d.growth.map((g: any) => g.joined) },
              { name: "Lost", color: SERIES[1], points: d.growth.map((g: any) => g.left) },
            ]}
          />
        </div>
        <div className={card}>
          <h2 className="text-sm font-bold text-content mb-3">Notifications — last 30 days</h2>
          <TrendChart
            days={d.sends.map((s: any) => s.day)}
            series={[
              { name: "Sent", color: SERIES[0], points: d.sends.map((s: any) => s.sent) },
              { name: "Shown", color: SERIES[1], points: d.sends.map((s: any) => s.delivered) },
              { name: "Tapped", color: SERIES[2], points: d.sends.map((s: any) => s.clicked) },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className={card}><h2 className="text-sm font-bold text-content mb-3">Top cities</h2><BarList rows={d.byCity} /></div>
        <div className={card}><h2 className="text-sm font-bold text-content mb-3">States</h2><BarList rows={d.byState} /></div>
        <div className={card}><h2 className="text-sm font-bold text-content mb-3">Browsers</h2><BarList rows={d.byBrowser} max={6} /></div>
        <div className={card}><h2 className="text-sm font-bold text-content mb-3">Phones & computers</h2><BarList rows={[...d.byDevice, ...d.byOS]} max={7} /></div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-content">What was sent (last 30 days)</h2>
          <button onClick={load} className={`${btnGhost} !py-1.5 !px-3 text-xs`}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
        {d.byType.length === 0 ? (
          <p className="text-xs text-content-tertiary py-6 text-center">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wider text-content-tertiary text-left">
                <th className="py-2 font-bold">Notification</th><th className="font-bold">Sent</th><th className="font-bold">Shown</th><th className="font-bold">Tapped</th><th className="font-bold">Tap rate</th><th className="font-bold">Failed</th>
              </tr></thead>
              <tbody className="divide-y divide-card-border/60">
                {d.byType.map((r: any) => (
                  <tr key={r.type}>
                    <td className="py-2 font-semibold text-content">{label(r.type)}</td>
                    <td className="tabular-nums">{fmt(r.sent)}</td>
                    <td className="tabular-nums">{fmt(r.delivered)}</td>
                    <td className="tabular-nums">{fmt(r.clicked)}</td>
                    <td className="tabular-nums font-semibold">{pct(r.clicked, r.delivered || r.sent)}</td>
                    <td className="tabular-nums text-content-secondary">{fmt(r.failed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {d.campaigns.length > 0 && (
        <div className={card}>
          <h2 className="text-sm font-bold text-content mb-3">Recent campaigns</h2>
          <div className="flex flex-col divide-y divide-card-border/60">
            {d.campaigns.map((c: any) => (
              <Link key={c._id} href={`/admin/push/campaigns/${c._id}`} className="py-2.5 flex items-center gap-3 hover:bg-surface-secondary rounded-lg px-1">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-content truncate">{c.name || c.title}</span>
                  <span className="block text-[11px] text-content-tertiary">{when(c.finishedAt || c.sendAt || c.createdAt)}</span>
                </span>
                <span className="text-xs text-content-secondary tabular-nums hidden sm:block">{fmt(c.stats?.sent)} sent · {pct(c.stats?.clicked || 0, c.stats?.delivered || c.stats?.sent || 0)} tapped</span>
                <Pill status={c.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
