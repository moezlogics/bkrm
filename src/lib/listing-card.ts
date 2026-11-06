/**
 * Listing → card projection.
 *
 * Feed pages used to serialize whole Listing documents into the RSC payload
 * (description, coordinates, locationRefs, videoLink, SEO copy…) even though
 * ListingCard reads about a dozen fields. On a 30-card homepage that was the
 * single biggest chunk of the HTML response.
 *
 * `CARD_SELECT` keeps the DB read narrow; `toCard()` trims what crosses the
 * wire — including collapsing galleryImages down to a count, since the card
 * only ever shows how many photos there are.
 */
import { VERTICAL } from "@/vertical";

/** Mongo projection: only what a card renders. */
export const CARD_SELECT =
  "name slug price previousPrice priceMode mainImage galleryImages videoLink address city createdAt isFeatured isUrgent condition customFieldValues userId";

/** Seller fields a card needs (verified seal + shop status). */
export const CARD_SELLER_SELECT = "verificationLevel isShop shopName";

/** Spec keys the card can surface (the vertical's card specs) — everything else is dead weight in the payload. */
const CARD_SPEC_KEYS = VERTICAL.cardSpecs.map((s) => s.field);

export interface CardAd {
  _id: string;
  slug: string;
  name: string;
  price: number | null;
  previousPrice?: number | null;
  priceMode: string;
  mainImage: string | null;
  imageCount: number;
  hasVideo?: boolean;
  address: string;
  city?: string | null;
  createdAt: string | Date;
  isFeatured: boolean;
  isUrgent?: boolean;
  condition: string | null;
  customFieldValues: Record<string, string>;
  verified: boolean;
  isShop?: boolean;
  shopName?: string | null;
}

/** Narrow a (possibly populated) Listing doc to the minimal card shape. */
export function toCard(l: any): CardAd {
  const cf = l?.customFieldValues || {};
  const specs: Record<string, string> = {};
  for (const k of CARD_SPEC_KEYS) {
    const v = cf instanceof Map ? cf.get(k) : cf[k];
    if (v !== undefined && v !== null && v !== "") specs[k] = String(v);
  }
  const gallery: string[] = l?.galleryImages || l?.images || [];
  const seller = l?.userId && typeof l.userId === "object" ? l.userId : null;

  const addr = (l?.address || "").trim();
  const ct = (l?.city || "").trim();
  let fullLocation = addr;
  if (addr && ct && !addr.toLowerCase().includes(ct.toLowerCase())) {
    fullLocation = `${addr}, ${ct}`;
  } else if (!addr) {
    fullLocation = ct || "Pakistan";
  }

  return {
    _id: String(l._id),
    slug: l.slug,
    name: l.name || l.title || "Untitled",
    price: l.price ?? null,
    previousPrice: typeof l.previousPrice === "number" ? l.previousPrice : null,
    priceMode: l.priceMode || "fixed",
    mainImage: l.mainImage || gallery[0] || null,
    imageCount: gallery.length,
    hasVideo: !!(l.videoLink || l.videoUrl),
    address: fullLocation,
    city: ct || null,
    createdAt: l.createdAt,
    isFeatured: !!l.isFeatured,
    isUrgent: !!l.isUrgent,
    condition: l.condition || null,
    customFieldValues: specs,
    verified: (seller?.verificationLevel || 0) >= 2,
    isShop: !!(seller?.isShop || (seller?.verificationLevel || 0) >= 3),
    shopName: seller?.shopName || null,
  };
}

/** Map + JSON-clean a list of listings for handing to client components. */
export function toCards(list: any[]): CardAd[] {
  return list.map(toCard);
}
