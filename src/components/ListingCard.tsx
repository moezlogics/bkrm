"use client";

import React, { useState, useEffect } from "react";
import { askForPush } from "@/lib/push-client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CardIcon } from "@/components/ui/CardIcons";
import { formatPrice, formatDate, cn } from "@/lib/utils";
import { trackImpression } from "@/lib/track";
import { useToast } from "@/components/ui/Toast";
import { loginUrl } from "@/lib/auth-intent";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";
import { imageProps, PLACEHOLDER_IMG } from "@/lib/cdn-image";
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

  const dropped = n.previousPrice != null && n.price != null && n.previousPrice > n.price;

  return (
    <div
      ref={pf.ref}
      {...pf.intentProps}
      className={cn(
        "listing-card group relative flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm ring-1 ring-black/[0.04] hover:shadow-lg active:scale-[0.985] transition-[box-shadow,transform] duration-200",
        className
      )}
    >
      {/* The card's one link, stretched over the whole card */}
      <Link href={`/ads/${n.slug}`} prefetch={pf.prefetch} className="absolute inset-0 z-0" aria-label={n.title} />

      <div className="relative aspect-[4/3] bg-surface-tertiary pointer-events-none overflow-hidden">
        <Image
          src={imgSrc}
          {...imageProps(imgSrc)}
          alt={n.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
          className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
          priority={priority}
          loading={priority ? undefined : "lazy"}
          onError={() => setImgSrc(PLACEHOLDER_IMG)}
        />

        {(n.isUrgent || n.isFeatured) && (
          <span className={`absolute top-2.5 left-2.5 h-[22px] px-2 rounded-full text-[11.5px] font-bold inline-flex items-center ${n.isUrgent ? "bg-danger text-white" : "bg-secondary-light text-amber-950"}`}>
            {n.isUrgent ? "Urgent" : "Featured"}
          </span>
        )}

        <button
          onClick={toggleFav}
          aria-label={fav ? "Remove from saved" : "Save"}
          aria-pressed={fav}
          className="pointer-events-auto absolute z-20 top-2 right-2 grid place-items-center h-9 w-9 rounded-full bg-white/90 backdrop-blur-sm text-content shadow-sm active:scale-90 transition-transform"
        >
          <CardIcon name="heart" className={fav ? "h-[18px] w-[18px] fill-danger text-danger" : "h-[18px] w-[18px]"} />
        </button>

        {(n.imageCount > 1 || n.hasVideo) && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11.5px] font-semibold">
            <CardIcon name="camera" className="h-3 w-3" /> {n.imageCount || 1}{n.hasVideo ? " · Video" : ""}
          </span>
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col p-3 sm:p-3.5 pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[16px] sm:text-[17px] font-extrabold tracking-tight text-content leading-none truncate">{priceLabel(n)}</span>
          {dropped && <span className="text-[12px] text-content-tertiary line-through truncate">{formatPrice(n.previousPrice!)}</span>}
          {(n.isShop || n.verified) && (
            <span className="ml-auto shrink-0 text-primary" title={n.isShop ? "Verified farm / shop" : "Verified seller"} aria-label={n.isShop ? "Verified farm or shop" : "Verified seller"}>
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 2.1 3.2-.3.8 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.8 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.8-3.1L2.8 15.5l1.2-3-1.2-3 2.8-1.6.8-3.1 3.2.3z"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          )}
        </div>

        <h3 className="mt-1.5 text-[14.5px] sm:text-sm font-medium text-content-secondary leading-snug line-clamp-2 group-hover:text-content transition-colors">
          {n.title}
        </h3>

        {specItems.length > 0 && (
          <p className="mt-1.5 text-[13px] font-semibold text-content truncate">{specItems.slice(0, 3).map((s) => s.replace(/\s*\([^)]*\)/, "")).join(" · ")}</p>
        )}

        <div className="mt-auto pt-2.5 flex items-center gap-1 text-[12.5px] text-content-tertiary min-w-0">
          <CardIcon name="pin" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={n.city}>{n.city}</span>
          <span suppressHydrationWarning className="ml-auto shrink-0 pl-1">{n.createdAt ? formatDate(n.createdAt) : ""}</span>
        </div>
      </div>
    </div>
  );
}

/** The standard responsive grid for listing cards. */
export function ListingGrid({ ads, priorityCount = 0, className = "" }: { ads: AnyAd[]; priorityCount?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4", className)}>
      {ads.map((ad, i) => <ListingCard key={ad._id} ad={ad} priority={i < priorityCount} />)}
    </div>
  );
}
