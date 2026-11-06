"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ListingCard } from "@/components/ListingCard";
import { Loader2, ArrowDown } from "lucide-react";

interface Props {
  initialListings: any[];
  total: number;
  onLoadMore: (nextPage: number) => Promise<any[]>;
  gridClassName?: string;
}

export function InfiniteListingFeed({
  initialListings,
  total,
  onLoadMore,
  gridClassName = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4",
}: Props) {
  const [items, setItems] = useState<any[]>(initialListings);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialListings.length < total);

  // Sync state if initialListings changes (e.g. user toggles a filter or sort)
  useEffect(() => {
    setItems(initialListings);
    setPage(1);
    setHasMore(initialListings.length < total);
  }, [initialListings, total]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchNext = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const nextBatch = await onLoadMore(nextPage);
      if (!nextBatch || nextBatch.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => {
          const existingIds = new Set(prev.map((it) => String(it._id)));
          const filtered = nextBatch.filter((it) => !existingIds.has(String(it._id)));
          const updated = [...prev, ...filtered];
          if (updated.length >= total || nextBatch.length === 0) {
            setHasMore(false);
          }
          return updated;
        });
        setPage(nextPage);
      }
    } catch (err) {
      console.error("Error loading more listings:", err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, total, onLoadMore]);

  // IntersectionObserver for seamless infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNext();
        }
      },
      { rootMargin: "350px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNext, hasMore]);

  return (
    <div className="flex flex-col">
      {/* Listing Cards Grid */}
      <div className={gridClassName}>
        {items.map((ad, idx) => (
          <ListingCard key={`${ad._id}-${idx}`} ad={ad} priority={idx < 2} />
        ))}
      </div>

      {/* Sentinel & Loading / Load More UI */}
      {hasMore && (
        <div ref={sentinelRef} className="mt-8 flex flex-col items-center justify-center gap-3 py-4">
          {loading ? (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-surface border border-card-border shadow-xs text-xs font-semibold text-content-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Loading more ads…</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={fetchNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface hover:bg-surface-secondary border border-card-border hover:border-primary text-xs font-semibold text-content-secondary hover:text-primary transition-all shadow-xs active:scale-95"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              <span>Load more ads ({total - items.length} remaining)</span>
            </button>
          )}
        </div>
      )}

      {/* End of feed banner */}
      {!hasMore && items.length > 0 && total > 12 && (
        <div className="mt-8 pt-4 border-t border-card-border/60 text-center">
          <p className="text-xs font-medium text-content-tertiary">
            Showing all {items.length} {items.length === 1 ? "listing" : "listings"}
          </p>
        </div>
      )}
    </div>
  );
}
