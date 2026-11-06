"use client";

import React, { useState, useEffect } from "react";
import { askForPush } from "@/lib/push-client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { CardIcon } from "@/components/ui/CardIcons";
import { formatPrice, formatDate, formatDistance, cn } from "@/lib/utils";
import { chat as chatApi } from "@/lib/api-client";
import { trackImpression } from "@/lib/track";
import { useToast } from "@/components/ui/Toast";
import { loginUrl } from "@/lib/auth-intent";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";
import { imageProps, PLACEHOLDER_IMG } from "@/lib/cdn-image";
import { withBasePath } from "@/lib/base-path";
import { specHighlights } from "@/vertical";

type AnyAd = Record<string, any>;

const CONDITION_LABEL: Record<string, string> = {
  new: "Brand New",
  used: "Used",
  refurbished: "Refurbished",
  "for-parts": "For Parts",
};

function normalize(ad: AnyAd) {
  const seller = ad.seller || ad.userId || {};
  const cf = ad.customFieldValues || {};
  return {
    id: ad._id,
    slug: ad.slug,
    title: ad.title || ad.name || "Untitled",
    price: ad.price ?? null,
    previousPrice: typeof ad.previousPrice === "number" ? ad.previousPrice : null,
    priceMode: ad.priceMode || "fixed",
    image: ad.mainImage || ad.galleryImages?.[0] || ad.images?.[0] || PLACEHOLDER_IMG,
    imageCount: (ad.imageCount ?? ad.galleryImages?.length ?? ad.images?.length ?? 0) as number,
    hasVideo: !!(ad.hasVideo || ad.videoLink || ad.videoUrl),
    city: (() => {
      const addr = typeof ad.address === "string" ? ad.address.trim() : "";
      const ct = typeof ad.city === "string" ? ad.city.trim() : "";
      if (addr && ct && !addr.toLowerCase().includes(ct.toLowerCase())) {
        return `${addr}, ${ct}`;
      }
      return addr || ct || "Pakistan";
    })(),
    createdAt: ad.createdAt,
    isFeatured: !!ad.isFeatured,
    isUrgent: !!ad.isUrgent,
    condition: ad.condition || null,
    cf,
    verified: ad.verified ?? ((typeof seller === "object" ? seller.verificationLevel || 0 : 0) >= 2),
    isShop: !!(ad.isShop || (typeof seller === "object" && (seller.isShop || (seller.verificationLevel || 0) >= 3))),
    distanceKm: typeof ad.distanceKm === "number" ? (ad.distanceKm as number) : null,
  };
}

function priceLabel(n: ReturnType<typeof normalize>): string {
  if (n.priceMode === "free") return "Free";
  if (n.priceMode === "contact" || n.price == null) return "Contact for price";
  return formatPrice(n.price);
}

export function ListingCard({ ad, className, priority = false }: { ad: AnyAd; className?: string; priority?: boolean }) {
  const n = normalize(ad);
  const { data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [fav, setFav] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [imgSrc, setImgSrc] = useState(n.image);
  // Prefetch the ad page on intent (touch/hover, or resting on screen) so the
  // tap opens it instantly. One link carries it; the others share the result.
  const pf = useIntentPrefetch<HTMLDivElement>({ dwell: true });

  useEffect(() => { trackImpression(String(n.id)); }, [n.id]);

  // Headline specs: "2021 · 38,000 km · Petrol · Automatic". "Brand New" leads
  // when it applies; ads without specs (parts, accessories) show their condition.
  const specItems: string[] = specHighlights(n.cf).map((h) => h.value);
  const condLabel = n.condition ? CONDITION_LABEL[n.condition] : null;
  if (condLabel && (n.condition === "new" || specItems.length === 0)) specItems.unshift(condLabel);

  const toggleFav = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session) { router.push(loginUrl(`/ads/${n.slug}`, "save")); return; }
    const nextFav = !fav;
    setFav(nextFav);
    toast.success(nextFav ? "Saved to favourites" : "Removed from favourites");
    try {
      await fetch("/api/favourites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: n.id }),
      });
      if (nextFav) askForPush("save");
    } catch {
      setFav(!nextFav);
    }
  };

  const share = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = typeof window !== "undefined" ? `${window.location.origin}${withBasePath(`/ads/${n.slug}`)}` : "";
    try {
      if (navigator.share) await navigator.share({ title: n.title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    } catch { /* cancelled */ }
  };

  const openChat = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session) { router.push(loginUrl(`/ads/${n.slug}`, "chat")); return; }
    setChatBusy(true);
    try {
      const res = await chatApi.createThread(String(n.id));
      if (res.success) { askForPush("chat"); router.push(`/chat?threadId=${res.data._id}`); }
      else toast.error("Couldn't start the chat");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't start the chat");
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div
      ref={pf.ref}
      {...pf.intentProps}
      className={cn(
        // active: tints the card the instant a finger lands, before the page swaps
        "listing-card group relative flex gap-3.5 sm:gap-4 bg-white active:bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200/90 p-3 hover:border-slate-300 hover:shadow-md transition-all duration-200",
        className
      )}
    >
      {/* The card's ONE link, stretched over the whole card */}
      <Link href={`/ads/${n.slug}`} prefetch={pf.prefetch} className="absolute inset-0 z-0 rounded-lg sm:rounded-xl" aria-label={n.title} />

      {/* Product Image Thumbnail */}
      <div className="relative z-10 w-32 sm:w-44 aspect-[4/3] sm:aspect-square shrink-0 rounded-md overflow-hidden bg-slate-100 pointer-events-none">
        <div className="relative w-full h-full">
          <Image
            src={imgSrc}
            {...imageProps(imgSrc)}
            alt={n.title}
            fill
            sizes="(max-width: 640px) 128px, 176px"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            priority={priority}
            loading={priority ? undefined : "lazy"}
            onError={() => setImgSrc(PLACEHOLDER_IMG)}
          />
        </div>

        {/* Urgent or Featured Tag */}
        {n.isUrgent ? (
          <span className="absolute top-2 left-2 bg-rose-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider shadow-xs pointer-events-none flex items-center gap-0.5">
            🔥 URGENT
          </span>
        ) : n.isFeatured ? (
          <span className="absolute top-2 left-2 bg-amber-400 text-slate-900 text-[9px] font-semibold px-2 py-0.5 rounded-sm uppercase tracking-wider shadow-xs pointer-events-none">
            FEATURED
          </span>
        ) : null}

        {/* Action icons: Save & Share */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-20 pointer-events-auto">
          <button
            onClick={toggleFav}
            aria-label="Save"
            className="grid place-items-center h-7 w-7 rounded-md bg-white/95 text-slate-700 shadow-sm hover:bg-white active:scale-90 transition-transform"
          >
            <CardIcon name="heart" className={fav ? "h-4 w-4 fill-red-500 text-red-500" : "h-4 w-4 text-slate-600"} />
          </button>
          <button
            onClick={share}
            aria-label="Share"
            className="grid place-items-center h-7 w-7 rounded-md bg-white/95 text-slate-700 shadow-sm hover:bg-white active:scale-90 transition-transform"
          >
            <CardIcon name="share" className="h-3.5 w-3.5 text-slate-600" />
          </button>
        </div>

        {/* Image / Video indicators */}
        <div className="absolute bottom-2 inset-x-2 flex items-center justify-between pointer-events-none">
          {n.imageCount > 1 ? (
            <span className="inline-flex items-center gap-1 bg-black/65 text-white text-[10px] font-medium px-2 py-0.5 rounded backdrop-blur-xs">
              <CardIcon name="camera" className="h-2.5 w-2.5" /> {n.imageCount}
            </span>
          ) : <span />}
          {n.hasVideo && (
            <span className="inline-flex items-center gap-1 bg-black/75 text-white text-[10px] font-medium px-1.5 py-0.5 rounded backdrop-blur-xs" title="Video available">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-rose-400"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Video
            </span>
          )}
        </div>
      </div>

      {/* Product Information */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-between py-0.5 pointer-events-none">
        <div>
          {/* Price Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-[17px] sm:text-[19px] font-bold text-slate-900 tracking-tight leading-none group-hover:text-primary transition-colors">
                {priceLabel(n)}
              </span>
              {n.previousPrice != null && n.price != null && n.previousPrice > n.price && (
                <span className="text-[11px] text-slate-400 line-through font-normal">
                  {formatPrice(n.previousPrice)}
                </span>
              )}
              {n.previousPrice != null && n.price != null && n.previousPrice > n.price && (
                <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1 py-0.5 rounded leading-none">
                  {formatPrice(n.previousPrice - n.price)} OFF
                </span>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {n.isShop ? (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-200">
                  Verified Shop
                </span>
              ) : n.verified ? (
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-medium px-1.5 py-0.5 rounded border border-blue-100">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2L15 5.6L19 5L18.4 9.1L22 11.2L18.4 13.3L19 17.4L15 16.8L12 20.4L9 16.8L5 17.4L5.6 13.3L2 11.2L5.6 9.1L5 5L9 5.6L12 2Z" fill="#2563eb"/><path d="M8.5 11.5L11 14L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Verified
                </span>
              ) : null}
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[13.5px] sm:text-[14px] font-medium text-slate-700 line-clamp-2 leading-snug group-hover:text-primary transition-colors mt-1.5">
            {n.title}
          </h3>

          {/* Headline specs */}
          {specItems.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11.5px] text-slate-500 font-normal mt-1.5">
              {specItems.map((item, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="text-slate-300">·</span>}
                  <span>{item}</span>
                </React.Fragment>
              ))}
            </div>
          )}
          {/* Location Row (Area & City) — Dedicated Full Width Line */}
          <div className="flex items-center gap-1.5 text-[11.5px] sm:text-[12px] text-slate-500 mt-1.5 min-w-0">
            <CardIcon name="pin" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate text-slate-600 font-medium" title={n.city}>
              {n.city}
            </span>
          </div>
        </div>

        {/* Footer: Date and Action */}
        <div className="flex items-center justify-between gap-2 pt-1.5 mt-auto border-t border-slate-100">
          <span suppressHydrationWarning className="text-[11px] text-slate-400 truncate">
            {n.createdAt ? formatDate(n.createdAt) : ""}
          </span>

          <button
            onClick={openChat}
            disabled={chatBusy}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-md bg-slate-900 hover:bg-primary text-white font-semibold text-xs px-2.5 py-1 sm:px-3 sm:py-1.5 shadow-xs active:scale-95 transition-all disabled:opacity-60 shrink-0"
          >
            {chatBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CardIcon name="chat" className="h-3.5 w-3.5" />}
            <span>Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}
