"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Fallback "new page starts at the top". Next's router already does this for
 * forward navigations, so normally there is nothing to do here. It must never
 * animate (a smooth scroll repaints the page for several frames right as it
 * appears — the navigation feels slow on a phone) and never fight Back/Forward,
 * which restore the list position the visitor left from.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const popped = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    const onPop = () => { popped.current = true; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; } // first load / reload: keep the browser's position
    if (popped.current) { popped.current = false; return; }   // Back/Forward: keep the restored position
    if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
