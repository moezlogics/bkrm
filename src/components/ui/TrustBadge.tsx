/**
 * Trust UI primitives — shared across listing cards, detail page, chat and profile.
 *
 * - VerifiedBadge: tiered identity badge driven by verificationLevel (0-3)
 * - SellerRating: star rating + count
 * - AdvanceWarning: anti-scam banner ("never pay advance")
 */
import { BadgeCheck, ShieldCheck, Store, Star, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERTICAL } from "@/vertical";

export type VerificationLevel = 0 | 1 | 2 | 3;

export function VerifiedBadge({
  level,
  className,
  showLabel = true,
}: {
  level: VerificationLevel | number;
  className?: string;
  showLabel?: boolean;
}) {
  if (!level || level < 1) return null;

  const config: Record<number, { label: string; icon: typeof BadgeCheck; cls: string }> = {
    1: { label: "Phone Verified", icon: ShieldCheck, cls: "bg-blue-50 text-blue-700 border-blue-200" },
    2: { label: "Verified", icon: BadgeCheck, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    3: { label: "Verified Shop", icon: Store, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const c = config[Math.min(level, 3)];
  const Icon = c.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        c.cls,
        className
      )}
      title={c.label}
    >
      <Icon className="h-3.5 w-3.5" />
      {showLabel && c.label}
    </span>
  );
}

export function SellerRating({
  rating,
  count,
  className,
}: {
  rating?: number;
  count?: number;
  className?: string;
}) {
  if (!rating || rating <= 0) {
    return <span className={cn("text-xs text-content-tertiary", className)}>No reviews yet</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      <span className="font-semibold">{rating.toFixed(1)}</span>
      {typeof count === "number" && <span className="text-content-tertiary">({count})</span>}
    </span>
  );
}

export function AdvanceWarning({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3.5 text-[13.5px] text-amber-950/80",
        className
      )}
    >
      <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-amber-600" />
      <p className="leading-snug">
        <strong className="text-amber-950 font-bold">Stay safe:</strong>{" "}
        {VERTICAL.copy.safetyNote || `Never send advance or token payments. Always meet in a public place and inspect the ${VERTICAL.noun.one} and its documents before paying.`}
      </p>
    </div>
  );
}
