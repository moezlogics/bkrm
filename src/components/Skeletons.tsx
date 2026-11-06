import React from "react";

/**
 * Route-level loading skeletons.
 *
 * These mirror the real layout closely enough that the swap to content doesn't
 * shift anything — the page feels instant even while data is in flight.
 */

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-tertiary/70 ${className}`} />;
}

/** Matches the horizontal ListingCard: image left, details right. */
export function CardSkeleton() {
  return (
    <div className="flex gap-2.5 bg-card rounded-xl border border-card-border p-2">
      <Shimmer className="w-24 sm:w-40 aspect-square shrink-0 rounded-lg" />
      <div className="flex-1 min-w-0 flex flex-col gap-2 py-0.5">
        <Shimmer className="h-3.5 w-4/5" />
        <Shimmer className="h-3.5 w-3/5" />
        <Shimmer className="h-4 w-24 mt-0.5" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 mt-1">
          {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-8 rounded-md" />)}
        </div>
        <div className="mt-auto pt-1.5 flex items-center gap-2">
          <Shimmer className="h-3 w-28" />
        </div>
        <Shimmer className="h-7 w-20 rounded-lg mt-1" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function SectionHeadSkeleton() {
  return (
    <div className="flex items-center justify-between mb-3">
      <Shimmer className="h-5 w-40" />
      <Shimmer className="h-4 w-16" />
    </div>
  );
}
