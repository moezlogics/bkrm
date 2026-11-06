"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MapPin, ChevronDown, ChevronRight, Navigation, Check, Search, X, Loader2 } from "lucide-react";
import type { ClientLocation } from "@/lib/visitor-location";
import { withBasePath } from "@/lib/base-path";

type Place = { _id: string; name: string; slug: string; count: number };

/**
 * OLX-style location picker: Pakistan → city → area, with live ad counts.
 *
 * Choices are plain <a> links to /go/location, which records the choice and
 * returns the visitor to the same page in the new place. They are deliberately
 * NOT <Link>s: Next prefetches Links in the viewport, and prefetching a
 * cookie-setting route would silently change the visitor's location.
 *
 * Also runs first-visit auto-detection: an instant IP guess (so the page is
 * personalised immediately), then a GPS fix to sharpen it to the nearest area.
 */

let autoDetectRan = false; // once per page load, across both picker instances

function requestGps(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 10 * 60 * 1000,
    });
  });
}

async function postLocation(body: Record<string, unknown>) {
  const r = await fetch("/api/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : null;
}

export function LocationPicker({
  location, variant = "inline", autoDetect = false,
}: {
  location: ClientLocation;
  variant?: "inline" | "compact";
  /** Only one mounted instance should run auto-detection. */
  autoDetect?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [cities, setCities] = useState<Place[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(location.city?.slug ?? null);
  const [areas, setAreas] = useState<Record<string, Place[]>>({});
  const [filter, setFilter] = useState("");
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: session, status: authStatus } = useSession();
  const userId = (session as any)?.userId || session?.user?.id || "";

  useEffect(() => {
    setMounted(true);
  }, []);

  const next = encodeURIComponent(pathname || "/");
  const go = (city: string, area?: string) =>
    withBasePath(`/go/location?city=${encodeURIComponent(city)}${area ? `&area=${encodeURIComponent(area)}` : ""}&next=${next}`);

  // ── First-visit auto-detection ──────────────────────────────────────────
  useEffect(() => {
    if (!autoDetect || autoDetectRan || authStatus === "loading") return;
    autoDetectRan = true;
    (async () => {
      // 1a) Logged in → this device and the profile share one location (once a
      //     session): the profile's city replaces an IP guess, a place picked
      //     here updates the profile. Falls back to the IP guess server-side.
      const syncKey = userId ? `loc_sync:${userId}` : "";
      let synced = false;
      try { synced = !!syncKey && !!sessionStorage.getItem(syncKey); } catch { /* storage off */ }
      if (syncKey && !synced) {
        try { sessionStorage.setItem(syncKey, "1"); } catch { /* storage off */ }
        const j = await postLocation({ mode: "sync" });
        if (j?.changed) { router.refresh(); return; } // the profile's place is now the location
      }
      // No IP guessing (owner's choice): the browser asks for the exact location.
      // 2) Sharpen with GPS unless the visitor picked a place or GPS already set it.
      if (location.source === "manual" || location.source === "gps") return;
      try {
        const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (perm?.state === "denied") return;
        // Don't re-prompt on every page if the visitor ignored the prompt.
        if (perm?.state === "prompt" && sessionStorage.getItem("gps_asked")) return;
        sessionStorage.setItem("gps_asked", "1");
      } catch { /* permissions API unavailable — just ask */ }
      const pos = await requestGps();
      if (!pos) return;
      // Allowed → switch the whole site to that place once, on this page too.
      const j = await postLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, next: window.location.pathname });
      if (j?.redirect && j.redirect !== window.location.pathname) window.location.assign(j.redirect);
      else if (j?.changed) window.location.reload();
    })().catch(() => {});
  }, [autoDetect, authStatus, userId, location.chosen, location.source, router]);

  // ── Data for the panel (lazy) ───────────────────────────────────────────
  useEffect(() => {
    if (!open || cities) return;
    fetch("/api/cities").then((r) => r.json()).then((j) => setCities(j.success ? j.data : [])).catch(() => setCities([]));
  }, [open, cities]);

  useEffect(() => {
    if (!open || !expanded || areas[expanded]) return;
    fetch(`/api/cities?citySlug=${expanded}`).then((r) => r.json())
      .then((j) => setAreas((a) => ({ ...a, [expanded]: j.success ? j.data : [] })))
      .catch(() => setAreas((a) => ({ ...a, [expanded]: [] })));
  }, [open, expanded, areas]);

  // Close on outside click / Escape; lock page scroll while the mobile sheet is up.
  useEffect(() => {
    if (!open) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (isMobile) {
      document.body.style.overflow = "hidden";
    }
    // The phone sheet is portalled into <body>: taps inside it are not "outside".
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (rootRef.current?.contains(t) || t.closest?.("[data-loc-panel]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      if (isMobile) document.body.style.overflow = "";
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  const useMyLocation = async () => {
    setGpsError("");
    setLocating(true);
    const pos = await requestGps();
    if (!pos) {
      setLocating(false);
      setGpsError("Location access is off. Allow it in your browser, or pick a city below.");
      return;
    }
    const j = await postLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, force: true, next: pathname });
    setLocating(false);
    setOpen(false);
    if (j?.redirect && j.redirect !== pathname) router.push(j.redirect);
    else router.refresh();
  };

  const q = filter.trim().toLowerCase();
  const visibleCities = useMemo(() => {
    if (!cities) return [];
    if (!q) return cities;
    // A city matches on its own name or any loaded area name.
    return cities.filter((c) =>
      c.name.toLowerCase().includes(q) || (areas[c.slug] || []).some((a) => a.name.toLowerCase().includes(q))
    );
  }, [cities, areas, q]);

  const label = location.city ? location.label : "All Pakistan";

  const panelContent = (
    <>
      <div className="md:hidden flex items-center justify-between px-5 pt-4 pb-2">
        <span className="text-[17px] font-bold text-content">Choose location</span>
        <button onClick={() => setOpen(false)} aria-label="Close" className="grid place-items-center h-8 w-8 rounded-full hover:bg-surface-secondary">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="w-full flex items-center gap-2.5 rounded-xl px-3.5 h-11 text-sm font-semibold text-primary-dark bg-primary-soft hover:bg-primary/15 disabled:opacity-70"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          <span className="flex-1 text-left">{locating ? "Finding your location…" : "Use my current location"}</span>
          {location.precise && <span className="text-[11px] font-medium text-content-tertiary">On</span>}
        </button>
        {gpsError && <p className="px-3 pb-1 text-[12px] text-danger">{gpsError}</p>}
        <div className="flex items-center gap-2 h-11 rounded-xl bg-surface-secondary px-3.5">
          <Search className="h-4 w-4 text-content-tertiary shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search city or area"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1 overscroll-contain">
        <a href={go("pk")} className="flex items-center justify-between px-4 py-2.5 text-sm text-content hover:bg-surface-secondary">
          <span className="font-medium">All Pakistan</span>
          {!location.city && <Check className="h-4 w-4 text-primary" />}
        </a>

        {cities === null ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-content-tertiary" /></div>
        ) : (
          visibleCities.map((c) => {
            const isOpen = expanded === c.slug;
            const isCurrentCity = location.city?.slug === c.slug;
            const cityAreas = (areas[c.slug] || []).filter((a) => !q || c.name.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
            return (
              <div key={c.slug} className="border-t border-card-border/60 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : c.slug)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-secondary"
                >
                  <ChevronRight className={`h-4 w-4 text-content-tertiary transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <span className={`flex-1 text-left ${isCurrentCity ? "font-semibold text-primary" : "text-content"}`}>{c.name}</span>
                  <span className="text-[12px] text-content-tertiary tabular-nums">{c.count}</span>
                </button>
                {isOpen && (
                  <div className="pb-1.5">
                    <a href={go(c.slug)} className="flex items-center justify-between pl-10 pr-4 py-2 text-[14px] hover:bg-surface-secondary">
                      <span className="font-medium text-content">All of {c.name}</span>
                      {isCurrentCity && !location.area && <Check className="h-4 w-4 text-primary" />}
                    </a>
                    {!areas[c.slug] ? (
                      <div className="pl-10 py-2"><Loader2 className="h-4 w-4 animate-spin text-content-tertiary" /></div>
                    ) : (
                      cityAreas.map((a) => {
                        const isCurrent = isCurrentCity && location.area?.slug === a.slug;
                        return (
                          <a key={a.slug} href={go(c.slug, a.slug)} className="flex items-center gap-2 pl-10 pr-4 py-2 text-[14px] hover:bg-surface-secondary">
                            <span className={`flex-1 ${isCurrent ? "font-semibold text-primary" : "text-content-secondary"}`}>{a.name}</span>
                            {isCurrent ? <Check className="h-4 w-4 text-primary" /> : (
                              <span className={`text-[12px] tabular-nums ${a.count ? "text-content-tertiary" : "text-content-tertiary/50"}`}>{a.count}</span>
                            )}
                          </a>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1.5 min-w-0 text-[14.5px] font-semibold text-content ${variant === "compact" ? "max-w-[44vw] h-9 pl-2.5 pr-2 rounded-full bg-surface-secondary active:bg-surface-tertiary" : ""}`}
      >
        <MapPin className={`h-4 w-4 shrink-0 text-primary ${location.precise ? "fill-primary/15" : ""}`} />
        <span className="truncate max-w-[160px]">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-content-tertiary transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Desktop dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Choose location"
          className="hidden md:flex absolute inset-x-auto bottom-auto left-0 top-full mt-3 w-80 max-h-[70vh] rounded-2xl z-50 bg-surface ring-1 ring-black/5 shadow-xl flex-col overflow-hidden"
        >
          {panelContent}
        </div>
      )}

      {/* Mobile bottom sheet modal via Portal */}
      {open && mounted && createPortal(
        <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="fixed inset-0 bg-overlay animate-fade-in" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            data-loc-panel
            aria-label="Choose location"
            className="relative z-10 bg-surface flex flex-col max-h-[85vh] rounded-t-[28px] animate-sheet-up pb-[env(safe-area-inset-bottom)]"
          >
            {panelContent}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

