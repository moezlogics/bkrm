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

/** Matches ListingCard: photo on top, price / title / meta below. */
export function CardSkeleton() {
  return (
    <div className="bg-card rounded-2xl overflow-hidden shadow-sm ring-1 ring-black/[0.04]">
      <Shimmer className="aspect-[4/3] w-full rounded-none" />
      <div className="p-3 flex flex-col gap-2">
        <Shimmer className="h-4 w-24" />
        <Shimmer className="h-3.5 w-11/12" />
        <Shimmer className="h-3.5 w-3/5" />
        <Shimmer className="h-3 w-4/5 mt-1.5" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
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
