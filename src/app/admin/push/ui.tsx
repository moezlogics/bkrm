"use client";

/** Shared bits for the push admin screens (same look as the other admin pages). */
import React from "react";

export const input = "bg-surface-secondary border border-card-border rounded-xl px-3 py-2.5 text-sm outline-none text-content focus:border-primary w-full";
export const label = "text-[11px] font-bold text-content uppercase tracking-wider";
export const card = "bg-card border border-card-border rounded-2xl p-5";
export const btn = "rounded-xl px-4 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50";
export const btnPrimary = `${btn} bg-primary hover:bg-primary-dark text-white`;
export const btnGhost = `${btn} border border-card-border text-content hover:bg-surface-secondary`;

export const jsonFetch = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  return r.json().catch(() => ({ success: false, message: `HTTP ${r.status}` }));
};

export const fmt = (n: unknown) => Number(n || 0).toLocaleString("en-US");
export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
export const when = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function Stat({ label: l, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-2xl p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-content-tertiary">{l}</p>
      <p className="text-2xl font-bold text-content mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-content-secondary mt-0.5">{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-amber-100 text-amber-800",
  sending: "bg-blue-100 text-blue-800",
  sent: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
  active: "bg-emerald-100 text-emerald-800",
  expired: "bg-slate-100 text-slate-600",
  invalid: "bg-red-100 text-red-700",
  unsubscribed: "bg-slate-100 text-slate-600",
};
export function Pill({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${TONES[status] || TONES.draft}`}>{status}</span>;
}

/** A labelled switch (used for every automation and toggle on these screens). */
export function Toggle({ on, onChange, label: l, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-slate-300"}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
      <span>
        <span className="block text-sm font-semibold text-content">{l}</span>
        {hint && <span className="block text-xs text-content-secondary mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
