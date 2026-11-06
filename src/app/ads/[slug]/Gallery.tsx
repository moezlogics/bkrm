"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { imageProps, PLACEHOLDER_IMG } from "@/lib/cdn-image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { loginUrl, useResumeIntent } from "@/lib/auth-intent";
import { ChevronLeft, ChevronRight, ArrowLeft, Heart, Share2, Zap, X, Maximize2, Play } from "lucide-react";

export function Gallery({
  images,
  title,
  isFeatured,
  adId,
  slug,
  alts = [],
  videoUrl,
  priceLabel,
  previousPriceLabel,
  condition,
  city,
  siteName,
  isShop,
  sellerName,
}: {
  images: string[];
  title: string;
  isFeatured?: boolean;
  adId?: string;
  slug?: string;
  alts?: string[];
  videoUrl?: string | null;
  priceLabel?: string | null;
  previousPriceLabel?: string | null;
  condition?: string | null;
  city?: string | null;
  siteName?: string | null;
  isShop?: boolean;
  sellerName?: string | null;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [active, setActive] = useState(0);
  const [fav, setFav] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = thumbRef.current;
    const el = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !el) return;
    strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
  }, [active]);

  const baseImgs = images.length ? images : [PLACEHOLDER_IMG];
  const items = [
    ...baseImgs.map((url, i) => ({ type: "image" as const, url, alt: alts[i] || title })),
    ...(videoUrl ? [{ type: "video" as const, url: videoUrl, alt: `${title} video` }] : []),
  ];

  const total = items.length;

  /** Saving requires an account; the heart previously only toggled locally. */
  const toggleFav = async () => {
    if (!session) { router.push(loginUrl(`/ads/${slug}`, "save")); return; }
    if (!adId) return;
    const next = !fav;
    setFav(next);
    toast.success(next ? "Saved to favourites" : "Removed from favourites");
    try {
      await fetch("/api/favourites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId }),
      });
    } catch { setFav(!next); } // roll back the optimistic toggle
  };

  useResumeIntent({ save: toggleFav }, !!session);

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const hasDragged = useRef(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const activeRef = useRef(0);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const scrollToSlide = useCallback((index: number) => {
    const target = (index + total) % total;
    activeRef.current = target;
    setActive(target);
    if (mainScrollRef.current) {
      isProgrammaticScroll.current = true;
      const el = mainScrollRef.current;
      const targetChild = el.children[target] as HTMLElement | undefined;
      if (targetChild && typeof targetChild.scrollIntoView === "function") {
        targetChild.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      } else {
        el.scrollTo({
          left: target * el.clientWidth,
          behavior: "smooth",
        });
      }
      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 450);
    }
  }, [total]);

  const go = useCallback((d: number) => {
    scrollToSlide(activeRef.current + d);
  }, [scrollToSlide]);

  const handleMainScroll = useCallback(() => {
    if (isProgrammaticScroll.current || !mainScrollRef.current) return;
    const { scrollLeft, clientWidth } = mainScrollRef.current;
    if (clientWidth <= 0) return;
    const index = Math.round(scrollLeft / clientWidth);
    if (index >= 0 && index < total && index !== activeRef.current) {
      activeRef.current = index;
      setActive(index);
    }
  }, [total]);

  useEffect(() => {
    const handleResize = () => {
      if (mainScrollRef.current) {
        const w = mainScrollRef.current.clientWidth;
        mainScrollRef.current.scrollTo({ left: active * w, behavior: "instant" as ScrollBehavior });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [active]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    isDragging.current = true;
    hasDragged.current = false;
    dragStartX.current = e.clientX;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    if (mainScrollRef.current) {
      dragStartScrollLeft.current = mainScrollRef.current.scrollLeft;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !mainScrollRef.current) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 6) {
      hasDragged.current = true;
      if (e.pointerType === "mouse") {
        mainScrollRef.current.style.scrollSnapType = "none";
        mainScrollRef.current.style.scrollBehavior = "auto";
        mainScrollRef.current.scrollLeft = dragStartScrollLeft.current - dx;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent, itemType: string) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dx = e.clientX - dragStartX.current;
    const dy = pointerDownPos.current ? Math.abs(e.clientY - pointerDownPos.current.y) : 0;
    pointerDownPos.current = null;

    if (mainScrollRef.current && e.pointerType === "mouse") {
      mainScrollRef.current.style.scrollSnapType = "x mandatory";
      mainScrollRef.current.style.scrollBehavior = "smooth";
    }

    if (!hasDragged.current && Math.abs(dx) < 8 && dy < 8) {
      if (itemType !== "video") {
        setLightboxOpen(true);
      }
    } else if (e.pointerType === "mouse" && hasDragged.current) {
      if (dx < -40) {
        go(1);
      } else if (dx > 40) {
        go(-1);
      } else {
        scrollToSlide(active);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) go(1);
      else go(-1);
    }
    setTouchStartX(null);
  };

  const goBack = () => {
    const sameSite = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
    if (sameSite && window.history.length > 1) router.back();
    else router.push("/");
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    } catch { /* cancelled */ }
  };

  // Lightbox keyboard controls (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, go]);

  const current = items[active] || items[0];

  return (
    <>
      <div className="flex flex-col gap-2 md:gap-3">
        {/*
          The stage: a fixed, sensible height on desktop (it used to be 4:3 of the
          whole column — ~715px tall on a wide screen), 5:4 on phones. Portrait
          phone photos sit on a blurred copy of themselves instead of grey bars.
        */}
        <div className="relative aspect-[5/4] md:aspect-auto md:h-[clamp(320px,58vh,540px)] bg-slate-100 md:rounded-xl overflow-hidden md:border md:border-card-border select-none group">
          {/* Scrollable Main Media Track with Native Scroll-Snap & Desktop Mouse Drag */}
          <div
            ref={mainScrollRef}
            onScroll={handleMainScroll}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => handlePointerUp(e, current.type)}
            onPointerCancel={() => { isDragging.current = false; }}
            className="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth hide-scrollbar touch-pan-x cursor-grab active:cursor-grabbing select-none"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {items.map((item, i) => (
              <div
                key={i}
                className="relative min-w-full w-full h-full flex-shrink-0 snap-center snap-always flex items-center justify-center bg-slate-100 overflow-hidden select-none"
              >
                {item.type === "video" ? (
                  <video
                    key={item.url}
                    src={item.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    {/* Soft backdrop: a tiny, blurred copy fills the letterbox */}
                    <Image
                      src={item.url}
                      {...imageProps(item.url)}
                      alt=""
                      aria-hidden
                      fill
                      sizes="96px"
                      draggable={false}
                      loading={i === 0 ? "eager" : "lazy"}
                      className="object-cover scale-110 blur-2xl opacity-60 pointer-events-none"
                    />
                    <Image
                      src={item.url}
                      {...imageProps(item.url)}
                      alt={item.alt || title}
                      fill
                      draggable={false}
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 60vw, 820px"
                      className="object-contain pointer-events-none"
                      priority={i === 0}
                      loading={i === 0 ? "eager" : "lazy"}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Back (phones — the site header is hidden on this page) */}
          <div className="md:hidden absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={goBack}
              className="grid place-items-center h-10 w-10 rounded-full bg-white/95 text-slate-800 shadow-md active:scale-90 transition-transform"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Share + save */}
          <div className="absolute top-3 right-3 z-10 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={share}
              className="grid place-items-center h-10 w-10 rounded-full bg-white/95 text-slate-800 shadow-md hover:bg-white active:scale-90 transition-transform"
              aria-label="Share"
            >
              <Share2 className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={toggleFav}
              className="grid place-items-center h-10 w-10 rounded-full bg-white/95 text-slate-800 shadow-md hover:bg-white active:scale-90 transition-transform"
              aria-label={fav ? "Remove from saved" : "Save"}
              aria-pressed={fav}
            >
              <Heart className={`h-5 w-5 ${fav ? "fill-red-500 text-red-500" : "text-slate-700"}`} />
            </button>
          </div>

          {isFeatured && (
            <span className="absolute top-3 left-1/2 -translate-x-1/2 md:left-3 md:translate-x-0 inline-flex items-center gap-1 bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wide shadow-sm pointer-events-none z-10">
              <Zap className="h-3 w-3 fill-white" /> Featured
            </span>
          )}

          {/* Expand hint (desktop hover) */}
          {current.type !== "video" && (
            <div className="hidden md:flex items-center gap-1.5 absolute bottom-3 left-3 rounded-full bg-black/60 text-white text-xs font-semibold px-3 py-1.5 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Click to enlarge</span>
            </div>
          )}

          {/* Photo counter */}
          {total > 1 && (
            <span className="absolute bottom-3 right-3 z-10 rounded-full bg-black/65 text-white text-xs font-semibold px-2.5 py-1 tabular-nums pointer-events-none backdrop-blur-md">
              {active + 1} / {total}
            </span>
          )}

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                className="hidden md:grid place-items-center absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/95 text-slate-800 shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white active:scale-95 transition-all z-10 cursor-pointer"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                className="hidden md:grid place-items-center absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/95 text-slate-800 shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white active:scale-95 transition-all z-10 cursor-pointer"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Thumbnails (desktop) — below the photo, not on top of it */}
        {total > 1 && (
          <div ref={thumbRef} className="hidden md:flex gap-2 overflow-x-auto hide-scrollbar scroll-smooth pb-0.5">
            {items.map((item, i) => {
              const isActive = i === active;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollToSlide(i)}
                  className={`relative shrink-0 h-16 w-20 rounded-lg overflow-hidden border-2 transition-all duration-150 cursor-pointer ${
                    isActive ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  aria-label={`View photo ${i + 1}`}
                  aria-current={isActive}
                >
                  {item.type === "video" ? (
                    <div className="w-full h-full bg-slate-900 grid place-items-center text-white">
                      <Play className="h-4 w-4 fill-white" />
                    </div>
                  ) : (
                    <Image
                      src={item.url}
                      {...imageProps(item.url)}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover pointer-events-none"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── OLX-Style Fullscreen Image Lightbox Modal ──────────────────────── */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col justify-between select-none animate-fadeIn">
          {/* Top Control Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-md border-b border-white/10 z-10">
            <div className="flex items-center gap-2 text-white/90 text-sm font-semibold">
              <span>{active + 1}</span>
              <span className="text-white/40">/</span>
              <span>{total}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={share}
                className="grid place-items-center h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Share"
              >
                <Share2 className="h-4.5 w-4.5" />
              </button>
              <button
                onClick={toggleFav}
                className="grid place-items-center h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Save"
              >
                <Heart className={`h-4.5 w-4.5 ${fav ? "fill-red-500 text-red-500" : "text-white"}`} />
              </button>
              <button
                onClick={() => setLightboxOpen(false)}
                className="grid place-items-center h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Close fullscreen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Stage with Image & Navigation */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative flex-1 flex items-center justify-center p-3 sm:p-6 min-h-0"
          >
            {total > 1 && (
              <button
                onClick={() => go(-1)}
                className="hidden sm:grid place-items-center absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-lg bg-black/60 text-white hover:bg-black/90 border border-white/15 transition-all z-10"
                aria-label="Previous"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <div className="relative w-full h-full max-w-5xl max-h-[82vh] flex items-center justify-center">
              {items[active]?.type === "video" ? (
                <video
                  src={items[active].url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain bg-black shadow-2xl"
                />
              ) : (
                <Image
                  src={items[active].url}
                  {...imageProps(items[active].url)}
                  alt={items[active].alt || title}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  priority
                />
              )}
            </div>

            {total > 1 && (
              <button
                onClick={() => go(1)}
                className="hidden sm:grid place-items-center absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-lg bg-black/60 text-white hover:bg-black/90 border border-white/15 transition-all z-10"
                aria-label="Next"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Bottom Thumbnails Strip */}
          {total > 1 && (
            <div className="bg-black/70 backdrop-blur-md border-t border-white/10 py-2.5 px-4 overflow-x-auto hide-scrollbar flex items-center justify-center gap-2">
              {items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => scrollToSlide(i)}
                  className={`relative shrink-0 h-12 w-12 sm:h-14 sm:w-14 rounded-md overflow-hidden border-2 transition-all ${
                    i === active ? "border-primary scale-105 shadow-md" : "border-white/20 opacity-60 hover:opacity-100"
                  }`}
                >
                  {item.type === "video" ? (
                    <div className="w-full h-full bg-slate-900 grid place-items-center text-white">
                      <Play className="h-5 w-5 fill-white" />
                    </div>
                  ) : (
                    <Image src={item.url} {...imageProps(item.url)} alt="" fill sizes="64px" className="object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
