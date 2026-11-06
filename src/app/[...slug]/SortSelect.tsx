"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Sort control. "Nearest" is offered only when the page has a reference point
 * (the visitor's location, or the city/area being browsed); the server picks
 * the default and tells us which one it is, so the URL stays clean.
 */
export function SortSelect({ current, canNearest, defaultSort }: { current: string; canNearest: boolean; defaultSort: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const change = (v: string) => {
    const params = new URLSearchParams(sp.toString());
    if (v === defaultSort) params.delete("sort"); else params.set("sort", v);
    params.delete("page");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  };
  return (
    <select
      value={current}
      onChange={(e) => change(e.target.value)}
      aria-label="Sort"
      className="text-sm font-medium text-content-secondary bg-surface border border-card-border rounded-lg px-2.5 h-9 outline-none"
    >
      <option value="newest">Newest first</option>
      {canNearest && <option value="nearest">Nearest first</option>}
      <option value="price_low">Price: Low to High</option>
      <option value="price_high">Price: High to Low</option>
    </select>
  );
}
