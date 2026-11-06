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
      className="text-[14.5px] font-bold text-content bg-white ring-1 ring-card-border rounded-full pl-3.5 pr-2 h-10 outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
    >
      <option value="newest">Newest first</option>
      {canNearest && <option value="nearest">Nearest first</option>}
      <option value="price_low">Lowest price</option>
      <option value="price_high">Highest price</option>
    </select>
  );
}
