"use client";

type BadgeVariant =
  | "approved"
  | "active"
  | "review"
  | "pending"
  | "rejected"
  | "sold"
  | "blocked"
  | "inactive"
  | "draft";

interface StatusBadgeProps {
  status: BadgeVariant;
  label?: string;
}

const variantMap: Record<
  BadgeVariant,
  { bg: string; text: string; dot: string }
> = {
  approved: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  active: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  review: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  rejected: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  sold: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  blocked: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  inactive: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    dot: "bg-gray-400",
  },
  draft: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    dot: "bg-gray-400",
  },
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const variant = variantMap[status] ?? variantMap.inactive;
  const displayLabel = label ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${variant.bg} ${variant.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${variant.dot}`} />
      {displayLabel}
    </span>
  );
}
