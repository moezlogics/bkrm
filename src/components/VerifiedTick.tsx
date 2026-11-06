import React from "react";
import { cn } from "@/lib/utils";

/**
 * Verified seal — a distinctive scalloped certification badge (NOT a
 * plain checkmark or emoji). Shown next to a seller's name everywhere their
 * listings/profile appear, once an admin approves their ID verification.
 */
function sealPoints(lobes = 11, outer = 11.2, inner = 9.4, cx = 12, cy = 12): string {
  const pts: string[] = [];
  for (let i = 0; i < lobes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / lobes) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

export function VerifiedTick({
  size = 16,
  withLabel = false,
  className,
  title = "Verified seller — ID document checked",
}: { size?: number; withLabel?: boolean; className?: string; title?: string }) {
  const seal = (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified" className="shrink-0">
      <title>{title}</title>
      <polygon points={sealPoints()} fill="#1d4ed8" />
      <polygon points={sealPoints(11, 8.6, 7.2)} fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.7" />
      <path d="M8.2 12.3l2.5 2.5 5-5.4" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (!withLabel) return <span className={cn("inline-flex", className)} title={title}>{seal}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-blue-700", className)} title={title}>
      {seal}
      <span className="text-[11px] font-bold">Verified</span>
    </span>
  );
}
