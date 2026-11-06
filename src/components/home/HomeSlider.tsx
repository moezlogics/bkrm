"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type SliderItem = {
  _id: string;
  image: string;
  sequence?: number;
  thirdPartyLink?: string | null;
  itemId?: { _id: string; slug?: string; name?: string } | string | null;
};

export function HomeSlider({ sliders }: { sliders: SliderItem[] }) {
  const [current, setCurrent] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const total = sliders.length;

  const nextSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrent((c) => (c + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    if (total <= 1) return;
    setCurrent((c) => (c - 1 + total) % total);
  }, [total]);

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (total <= 1) return;
    timerRef.current = setInterval(nextSlide, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [total, nextSlide, current]);

  const pauseAuto = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const resumeAuto = () => {
    if (total <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(nextSlide, 5000);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    pauseAuto();
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    resumeAuto();
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) nextSlide();
      else prevSlide();
    }
    setTouchStart(null);
  };

  if (!sliders || sliders.length === 0) {
    return null;
  }

  return (
    <section className="wrap pt-3 sm:pt-4 pb-2">
      <div
        className="relative w-full overflow-hidden select-none group"
        onMouseEnter={pauseAuto}
        onMouseLeave={resumeAuto}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Banner Container — Natural Aspect Ratio of uploaded images, no borders */}
        <div className="relative w-full">
          {sliders.map((slider, idx) => {
            const isCurrent = idx === current;
            const targetUrl = slider.thirdPartyLink
              ? slider.thirdPartyLink
              : slider.itemId && typeof slider.itemId === "object" && slider.itemId.slug
              ? `/ads/${slider.itemId.slug}`
              : typeof slider.itemId === "string"
              ? `/ads/${slider.itemId}`
              : null;

            const imgElement = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slider.image}
                alt={`Banner ${idx + 1}`}
                className="w-full h-auto block rounded-xl sm:rounded-2xl"
                loading={idx === 0 ? "eager" : "lazy"}
              />
            );

            const content = targetUrl ? (
              targetUrl.startsWith("http") ? (
                <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
                  {imgElement}
                </a>
              ) : (
                <Link href={targetUrl} className="block w-full">
                  {imgElement}
                </Link>
              )
            ) : (
              imgElement
            );

            return (
              <div
                key={slider._id || idx}
                className={`transition-opacity duration-500 ease-in-out ${
                  isCurrent ? "relative opacity-100 z-10 pointer-events-auto" : "absolute inset-0 opacity-0 z-0 pointer-events-none"
                }`}
              >
                {content}
              </div>
            );
          })}
        </div>

        {/* Carousel Left / Right Navigation Controls */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous slide"
              className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-black/50 hover:bg-black text-white shadow-md transition-all opacity-80 sm:opacity-0 group-hover:opacity-100 active:scale-95"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next slide"
              className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-black/50 hover:bg-black text-white shadow-md transition-all opacity-80 sm:opacity-0 group-hover:opacity-100 active:scale-95"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            {/* Bottom Dots Indicator */}
            <div className="absolute bottom-2.5 sm:bottom-3 inset-x-0 z-20 flex items-center justify-center gap-1.5 pointer-events-none">
              <div className="flex items-center gap-1.5 p-1 rounded-full bg-black/25 backdrop-blur-xs pointer-events-auto">
                {sliders.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrent(idx)}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      idx === current ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                    }`}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
