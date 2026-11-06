import React from "react";
import { VerifiedTick } from "@/components/VerifiedTick";
import { trustKind, TRUST_LABEL, type TrustKind } from "@/lib/trust";
import { cn } from "@/lib/utils";

type U = Parameters<typeof trustKind>[0];

/**
 * The right badge for a user (see lib/trust): blue seal for ID-verified
 * sellers, gold seal for verified shops, a plain check for verified users.
 */
export function TrustMark({ user, kind, size = 16, withLabel = false, className }: {
  user?: U; kind?: TrustKind; size?: number; withLabel?: boolean; className?: string;
}) {
  const k = kind === undefined ? trustKind(user) : kind;
  if (!k) return null;
  const t = TRUST_LABEL[k];

  if (k === "user") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-emerald-700", className)} title={t.title}>
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <circle cx="12" cy="12" r="10" fill="#10b981" />
          <path d="M7.8 12.4l2.7 2.7 5.7-5.9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {withLabel && <span className="text-[12px] font-semibold">{t.label}</span>}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1", k === "shop" ? "text-amber-700" : "text-blue-700", className)} title={t.title}>
      {k === "shop" ? <ShopSeal size={size} /> : <VerifiedTick size={size} title={t.title} />}
      {withLabel && <span className="text-[12px] font-semibold">{t.label}</span>}
    </span>
  );
}

function ShopSeal({ size }: { size: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 22; i++) {
    const r = i % 2 === 0 ? 11.2 : 9.4;
    const a = (Math.PI / 11) * i - Math.PI / 2;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <polygon points={pts.join(" ")} fill="#d97706" />
      <path d="M8.2 12.3l2.5 2.5 5-5.4" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
