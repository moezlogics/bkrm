"use client";

/**
 * Small charts for the push dashboard: a 30-day trend (one axis, 2-3 series,
 * legend + hover readout) and a ranked bar list. Colours are a validated
 * categorical set; every value is also readable as text (legend, tooltip,
 * bar labels), so nothing depends on colour alone.
 */
import React, { useMemo, useRef, useState } from "react";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];

export type Series = { name: string; color: string; points: number[] };

const fmt = (n: number) => n.toLocaleString("en-US");

export function TrendChart({ days, series, height = 170 }: { days: string[]; series: Series[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = 720, H = height, P = { t: 12, r: 10, b: 20, l: 34 };
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const nice = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / step) * step;
  }, [max]);
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, days.length - 1);
  const y = (v: number) => P.t + (1 - v / nice) * (H - P.t - P.b);
  const path = (p: number[]) => p.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const empty = series.every((s) => s.points.every((v) => !v));
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="relative" ref={box}>
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-content-secondary">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
            <span className="text-content-tertiary font-medium">{fmt(s.points.reduce((a, b) => a + b, 0))}</span>
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={series.map((s) => `${s.name}: ${fmt(s.points.reduce((a, b) => a + b, 0))}`).join(", ")}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (days.length - 1));
          setHover(Math.max(0, Math.min(days.length - 1, i)));
        }}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--card-border)" strokeWidth="1" />
            <text x={P.l - 6} y={y(nice * f) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-tertiary, #94a3b8)">{fmt(Math.round(nice * f))}</text>
          </g>
        ))}
        {!empty && series.map((s) => (
          <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover != null && !empty && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--card-border)" strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.points[hover] || 0)} r="4.5" fill={s.color} stroke="var(--card-bg, #ffffff)" strokeWidth="2" />
            ))}
          </>
        )}
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--text-tertiary, #94a3b8)">{label(days[i])}</text>
        ))}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="var(--text-tertiary, #94a3b8)">Nothing yet</text>}
      </svg>
      {hover != null && !empty && (
        <div
          className="pointer-events-none absolute top-8 rounded-lg border border-card-border bg-card px-2.5 py-1.5 shadow-lg text-[12px]"
          style={{ left: `calc(${(x(hover) / W) * 100}% - 60px)` }}
        >
          <p className="font-semibold text-content mb-0.5">{label(days[hover])}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-1.5 text-content-secondary whitespace-nowrap">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.name} <b className="text-content">{fmt(s.points[hover] || 0)}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ranked list ("Lahore 1,240"), bar width relative to the biggest row. */
export function BarList({ rows, empty = "No data yet", max = 8 }: { rows: { name: string; n: number }[]; empty?: string; max?: number }) {
  const top = rows.slice(0, max);
  const peak = Math.max(1, ...top.map((r) => r.n));
  if (!top.length) return <p className="text-xs text-content-tertiary py-6 text-center">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      {top.map((r) => (
        <div key={r.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs font-medium text-content" title={r.name}>{r.name}</span>
          <span className="flex-1 h-2.5 rounded-full bg-surface-secondary overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (r.n / peak) * 100)}%`, background: SERIES[0] }} />
          </span>
          <span className="w-14 text-right text-xs font-semibold text-content tabular-nums">{fmt(r.n)}</span>
        </div>
      ))}
    </div>
  );
}
