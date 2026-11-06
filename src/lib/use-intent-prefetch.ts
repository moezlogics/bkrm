"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Prefetch a link's full page as soon as the visitor shows intent, so the tap
 * itself does no network work and the page opens instantly.
 *
 * Every page here is dynamic (it follows the visitor's location), and Next
 * only prefetches dynamic pages with `prefetch={true}`. Doing that for every
 * card on screen would download dozens of pages per scroll, so a link "arms"
 * only when:
 *   - a finger or cursor lands on it (touchstart / pointerenter / focus), or
 *   - it has sat on screen for DWELL_MS — i.e. the visitor stopped scrolling
 *     on it, rather than it flying past.
 * Dwell arming is opt-in (`dwell: true`) — for listing cards, the likeliest
 * taps. Chips, breadcrumbs and "View all" arm on real intent only: measured on
 * a list page, dwell-arming everything prefetched ~20 pages per view because
 * every chip "rests on screen" while the page loads.
 * Dwell arming is also skipped when the browser reports Data Saver.
 *
 * Usage: const p = useIntentPrefetch<HTMLAnchorElement>();
 *        <Link ref={p.ref} prefetch={p.prefetch} {...p.intentProps} />
 */

const DWELL_MS = 250;

let observer: IntersectionObserver | null = null;
const listeners = new WeakMap<Element, (visible: boolean) => void>();

function sharedObserver(): IntersectionObserver | null {
  if (observer) return observer;
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  observer = new IntersectionObserver(
    (entries) => { for (const e of entries) listeners.get(e.target)?.(e.isIntersecting); },
    { threshold: 0.6 }
  );
  return observer;
}

const saveData = () =>
  typeof navigator !== "undefined" && (navigator as any).connection?.saveData === true;

export function useIntentPrefetch<T extends Element>({ dwell = false }: { dwell?: boolean } = {}) {
  const ref = useRef<T>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!dwell || !el || armed || saveData()) return;
    const obs = sharedObserver();
    if (!obs) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    listeners.set(el, (visible) => {
      if (visible && !timer) timer = setTimeout(() => setArmed(true), DWELL_MS);
      else if (!visible && timer) { clearTimeout(timer); timer = null; }
    });
    obs.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      obs.unobserve(el);
      listeners.delete(el);
    };
  }, [armed, dwell]);

  const arm = () => { if (!armed) setArmed(true); };
  return {
    ref,
    prefetch: armed,
    intentProps: { onPointerEnter: arm, onTouchStart: arm, onFocus: arm },
  };
}
