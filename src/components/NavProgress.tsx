"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top progress bar for route changes.
 *
 * Archive and detail routes deliberately have no `loading.tsx` — a streaming
 * boundary there would force a 200 before `notFound()` could run, turning
 * empty archives and dead listings into soft 404s. This gives the same
 * "the tap registered" feedback without touching the response status.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0); // 0 = hidden
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Any in-app link click starts the bar.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement)?.closest?.("a");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || link.target === "_blank" || link.hasAttribute("download")) return;
      // Same-origin, different URL only.
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch { return; }

      clearTimers();
      // Prefetched pages open instantly; only show the bar if the navigation
      // is still pending after a beat, so instant taps don't flash it.
      timers.current.push(setTimeout(() => setProgress(12), 100));
      // Creep forward so a slow route still looks alive, never reaching 100.
      timers.current.push(setTimeout(() => setProgress(55), 120));
      timers.current.push(setTimeout(() => setProgress(78), 400));
      timers.current.push(setTimeout(() => setProgress(90), 1200));
      // Safety net: never leave the bar stuck if navigation is cancelled.
      timers.current.push(setTimeout(() => setProgress(0), 10000));
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Arrival: snap to full, then fade out.
  useEffect(() => {
    clearTimers();
    setProgress((p) => (p === 0 ? 0 : 100));
    const t = setTimeout(() => setProgress(0), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => clearTimers, []);

  if (progress === 0) return null;
  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 z-[60] h-0.5 pointer-events-none"
    >
      <div
        className="h-full bg-primary transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress === 100 ? 0 : 1 }}
      />
    </div>
  );
}
