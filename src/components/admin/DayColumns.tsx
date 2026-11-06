"use client";

/**
 * One measure per day as thin columns (admin dashboard / insights).
 *
 * A single series, so no legend: the card title names it. Columns ≤ 24px with a
 * 4px rounded top, hairline grid, y ticks at clean numbers; every column is a
 * focusable hit area wider than the bar with a tooltip (value first, then the
 * day), and the same numbers are one click away as a table. Colours are the
 * validated chart blue for this site's light and dark surfaces.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";

export interface DayPoint { day: string; value: number }

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(n));
const dayLabel = (d: string, long = false) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PK", { day: "numeric", month: "short", ...(long ? { weekday: "short" } : {}), timeZone: "UTC" });

/** 0 → max in 2–4 clean steps (1, 2, 2.5, 5 × 10ⁿ). */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  // Counts: never a fractional step (no "0.5 accounts").
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && Number.isInteger(s)) || 10 * mag);
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function DayColumns({ title, hint, data, unit }: { title: string; hint?: string; data: DayPoint[]; unit: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the card's real width, so text stays at its true size on phones.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const total = data.reduce((a, p) => a + p.value, 0);
  const last7 = data.slice(-7).reduce((a, p) => a + p.value, 0);
  const prev7 = data.slice(-14, -7).reduce((a, p) => a + p.value, 0);
  const t = useMemo(() => ticks(Math.max(...data.map((p) => p.value), 0)), [data]);
  const top = t[t.length - 1] || 1;

  const H = 160, padL = 34, padB = 20, padT = 8;
  const plotW = W - padL, plotH = H - padB - padT;
  const slot = plotW / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, slot - 2)); // 2px surface gap at least
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const delta = prev7 ? Math.round(((last7 - prev7) / prev7) * 100) : null;

  return (
    <div className="viz bg-card border border-card-border rounded-2xl p-5 shadow-sm flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-content">{title}</h3>
          {hint && <p className="text-[11px] text-content-secondary mt-0.5">{hint}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold text-content">{total.toLocaleString("en-PK")}</div>
          <div className="text-[11px] text-content-secondary">
            last 30 days{delta != null && <> · <span className={delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span> vs prior week</>}
          </div>
        </div>
      </div>

      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="w-full block" role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{`${title}: ${total.toLocaleString("en-PK")} ${unit} in the last 30 days`}</title>
          {t.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text x={padL - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</text>
            </g>
          ))}
          {data.map((p, i) => {
            const x = padL + i * slot + (slot - bw) / 2;
            const h = Math.max(0, y(0) - y(p.value));
            const r = Math.min(4, bw / 2, h);
            const top0 = y(0) - h;
            const path = h > 0
              ? `M${x},${y(0)} V${top0 + r} Q${x},${top0} ${x + r},${top0} H${x + bw - r} Q${x + bw},${top0} ${x + bw},${top0 + r} V${y(0)} Z`
              : "";
            return (
              <g key={p.day}>
                {path && <path d={path} fill="var(--viz-series)" opacity={hover == null || hover === i ? 1 : 0.55} />}
                <rect
                  x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent"
                  tabIndex={0} role="button" aria-label={`${dayLabel(p.day, true)}: ${p.value.toLocaleString("en-PK")} ${unit}`}
                  onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  style={{ outline: "none", cursor: "default" }}
                />
              </g>
            );
          })}
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((i, k, a) => data[i] && a.indexOf(i) === k).map((i) => (
            <text key={i} x={padL + i * slot + slot / 2} y={H - 4} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--viz-muted)">{dayLabel(data[i].day)}</text>
          ))}
        </svg>
        {hover != null && data[hover] && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-card-border bg-card px-2.5 py-1.5 shadow-lg text-xs whitespace-nowrap"
            style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }}
          >
            <div className="font-bold text-content">{data[hover].value.toLocaleString("en-PK")} {unit}</div>
            <div className="text-content-secondary">{dayLabel(data[hover].day, true)}</div>
          </div>
        )}
      </div>

      <details className="text-xs text-content-secondary">
        <summary className="cursor-pointer font-semibold hover:text-content">Show as table</summary>
        <table className="mt-2 w-full">
          <thead><tr className="text-left"><th className="py-1 font-semibold">Day</th><th className="py-1 font-semibold text-right">{unit[0].toUpperCase() + unit.slice(1)}</th></tr></thead>
          <tbody>
            {[...data].reverse().map((p) => (
              <tr key={p.day} className="border-t border-card-border/60"><td className="py-1">{dayLabel(p.day, true)}</td><td className="py-1 text-right tabular-nums text-content">{p.value.toLocaleString("en-PK")}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
      <style>{`.viz{--viz-series:#2a78d6;--viz-grid:#e1e0d9;--viz-axis:#c3c2b7;--viz-muted:#898781}.dark .viz{--viz-series:#3987e5;--viz-grid:rgba(255,255,255,.08);--viz-axis:rgba(255,255,255,.22);--viz-muted:#898781}`}</style>
    </div>
  );
}

/** A ranked list with a thin bar per row (one series, value at the tip). */
export function RankedBars({ title, rows, empty }: { title: string; rows: { label: string; value: number; href?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="viz bg-card border border-card-border rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-content mb-3">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-content-secondary">{empty}</p> : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                {r.href ? <a href={r.href} className="truncate text-content hover:text-primary">{r.label}</a> : <span className="truncate text-content">{r.label}</span>}
                <span className="text-content-secondary tabular-nums shrink-0">{r.value.toLocaleString("en-PK")}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: "var(--viz-series)" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <style>{`.viz{--viz-series:#2a78d6}.dark .viz{--viz-series:#3987e5}`}</style>
    </div>
  );
}
