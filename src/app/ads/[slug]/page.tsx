import React from "react";
import { cache } from "react";
import type { Metadata } from "next";
import dbConnect from "@/lib/mongodb";
import mongoose from "mongoose";
import Listing from "@/models/Listing";
import Category from "@/models/Category";
import User from "@/models/User";
import Media from "@/models/Media";
import { notFound } from "next/navigation";
import {
  MapPin,
  Calendar,
  ChevronRight,
  ShieldCheck,
  Check,
} from "lucide-react";
import Link from "next/link";
import { DetailActions } from "./DetailActions";
import { BookingBox } from "@/components/bookings/BookingBox";
import { OwnerPanel, type OwnerInfo } from "@/components/ads/OwnerPanel";
import { getEntitlements } from "@/lib/plan";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { bookingSummary } from "@/lib/bookings/server";
import { Gallery } from "./Gallery";
import { ViewBeacon } from "./ViewBeacon";
import { ListingCard } from "@/components/ListingCard";
import { ReportButton } from "@/components/ReportButton";
import { JsonLd } from "@/components/JsonLd";
import { getBaseUrl, listingJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { getServerSession } from "@/lib/auth";
import { formatPrice, formatDate, cn, priceInWords } from "@/lib/utils";
import { getVisitorLocation, oid } from "@/lib/visitor-location";
import { getCatalog } from "@/lib/catalog";
import { CARD_SELECT, CARD_SELLER_SELECT, toCards } from "@/lib/listing-card";
import { nearestListings } from "@/lib/geo-feed";
import { getScopeCounts, countIn } from "@/lib/scope-counts";
import { TtlLru } from "@/lib/memo";
import { haversine } from "@/lib/geo";
import { SellerRating, AdvanceWarning } from "@/components/ui/TrustBadge";
import { TrustMark } from "@/components/TrustMark";
import { getSettings } from "@/lib/settings";
import { VERTICAL, specHighlights } from "@/vertical";
import { iconFor } from "@/vertical/icons";
import { fieldDefsFor, displayValue } from "@/lib/field-defs";

/** Only the seller fields the page renders — not the whole user document. */
// phoneNumber only feeds the trust badge (server-side) — it isn't sent to the browser.
const SELLER_FIELDS = "name profileImage verificationLevel verificationStatus emailVerified provider phoneNumber rating ratingCount createdAt salesCount";

const getAdDetails = cache(async function getAdDetails(slug: string) {
  await dbConnect();
  let item = await Listing.findOne({ slug })
    .populate({ path: "userId", model: User, select: SELLER_FIELDS })
    .lean();

  // Fallback lookups: direct ObjectId or slug ending with an ID suffix
  if (!item && mongoose.isValidObjectId(slug)) {
    item = await Listing.findById(slug)
      .populate({ path: "userId", model: User, select: SELLER_FIELDS })
      .lean();
  }
  if (!item && slug.includes("-")) {
    const possibleId = slug.split("-").pop();
    if (possibleId && mongoose.isValidObjectId(possibleId)) {
      item = await Listing.findById(possibleId)
        .populate({ path: "userId", model: User, select: SELLER_FIELDS })
        .lean();
    }
  }

  if (!item) return null;
  const ad = JSON.parse(JSON.stringify(item));
  // Category from the cached catalog instead of a populate round trip (falls
  // back to a query only for a category that's since been deactivated).
  const catalog = await getCatalog();
  const catId = ad.categoryId ? String(ad.categoryId) : "";
  ad.categoryId = catalog.categoryById(catId)
    ?? (catId ? JSON.parse(JSON.stringify(await Category.findById(catId).lean())) : null);
  return { ad };
});

const extras = new TtlLru<[any[], any[], number, any[]]>(1000, 30_000);

function priceLabelOf(ad: any): string {
  if (ad.priceMode === "free") return "Free";
  if (ad.priceMode === "contact" || ad.price == null) return "Contact for price";
  return formatPrice(ad.price);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">{children}</h2>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getAdDetails(slug);
  if (!data) return { title: "Listing not found" };
  const { ad } = data;
  // Not public (in review / rejected): no title, description or photos in the head.
  if (ad.status === "review" || ad.status === "rejected") return { title: "Listing not found", robots: { index: false, follow: false } };
  const base = getBaseUrl();
  // Canonical consolidates link equity directly onto the national model archive page (without city/area):
  const modelArchivePath = ad.categoryId?.path || VERTICAL.primaryTop;
  const canonical = `${base}/${modelArchivePath}`;
  const priceStr = ad.price != null ? ` - ${formatPrice(ad.price)}` : "";
  const title = `${ad.name}${priceStr}${ad.city ? ` in ${ad.city}` : ""}`;
  const description = (ad.seoDescription || ad.description || `${ad.name} for sale${ad.city ? ` in ${ad.city}` : ""}.`).slice(0, 160);
  const images = ad.galleryImages?.length ? ad.galleryImages : ad.mainImage ? [ad.mainImage] : [];
  return {
    title,
    description,
    alternates: { canonical },
    // Single listings are noindexed to avoid thin/expired listing index bloat in Google,
    // while follow: true enables search engines to crawl internal model archives and breadcrumbs.
    robots: { index: false, follow: true },
    openGraph: { type: "website", title, description, url: `${base}/ads/${ad.slug}`, images: images.length ? images : undefined },
  };
}

export default async function AdDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, session, loc, settings] = await Promise.all([getAdDetails(slug), getServerSession(), getVisitorLocation(), getSettings()]);
  if (!data) notFound();
  // An ad held for review or rejected (including a blocked seller's hidden
  // ads) is only for its seller and the admins: before, anyone with the link
  // could open it — and call the number on it.
  if (data.ad.status === "review" || data.ad.status === "rejected") {
    const ownerId = String(data.ad.userId?._id || data.ad.userId || "");
    if (!session || (session.role !== "admin" && session.userId !== ownerId)) notFound();
  }
  const loggedIn = !!session;
  const siteName = settings.site_name || VERTICAL.defaults.siteName;
  // Qasai, hissa…: the ad can be booked, not only called.
  const booking = BOOKINGS_ON ? await bookingSummary(slug).catch(() => null) : null;

  // The seller looking at their own ad gets their tools, not buttons to call themselves.
  const ownerIdOf = String(data.ad.userId?._id || data.ad.userId || "");
  let owner: OwnerInfo | null = null;
  if (session?.userId && session.userId === ownerIdOf) {
    const ent = await getEntitlements(session.userId).catch(() => null);
    const a: any = data.ad;
    owner = {
      adId: String(a._id), slug: a.slug, status: a.status,
      views: Number(a.clicks) || 0, leads: (Number(a.phoneClicks) || 0) + (Number(a.whatsappClicks) || 0) + (Number(a.chatClicks) || 0),
      saves: Number(a.favouritesCount) || 0,
      featuredUntil: a.isFeatured && a.featuredExpiresAt ? new Date(a.featuredExpiresAt).toISOString() : null,
      isFree: !ent || ent.isFree, boostsLeft: ent ? Math.max(0, ent.featuredLimit - ent.featuredUsed) : 0,
    };
  }

  const { ad } = data;

  // ── Location-aware extras ──────────────────────────────────────────────
  const c = ad.location?.coordinates;
  const adPoint: [number, number] | null =
    Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" && (c[0] !== 0 || c[1] !== 0)
      ? [c[0], c[1]] : null;

  // Similar ads (same brand, else same category), nearest to the visitor —
  // or to this ad when we don't know where the visitor is.
  const relCatId = ad.allCategoryIds?.[1] || ad.allCategoryIds?.[0] || ad.categoryId?._id;
  const rankFrom = loc.point ?? adPoint;
  const selfId = oid(ad._id);
  const galleryUrls: string[] = ad.galleryImages?.length ? ad.galleryImages : ad.mainImage ? [ad.mainImage] : [];
  // The ad itself is always read fresh (price, sold…); what's around it is the
  // same for everyone ranking from the same point, so it's shared for 30 s.
  const [similarRaw, around, sellerLiveCount, mediaAlts] = await extras.memo(`${ad._id}|${rankFrom ?? ""}`, () => Promise.all([
    !relCatId
      ? Promise.resolve([])
      : rankFrom
        // sizeHint: a rare brand is sorted by distance in code, not by a $geoNear
        // walk across the whole map (lib/geo-feed).
        ? getScopeCounts().then((counts) => nearestListings({
            point: rankFrom, match: { allCategoryIds: String(relCatId), _id: { $ne: selfId } }, limit: 6,
            sizeHint: countIn(counts, { catId: String(relCatId) }),
          }))
        // No location on either side: newest in the same brand instead.
        : Listing.find({ allCategoryIds: String(relCatId), status: "approved", _id: { $ne: selfId } })
            .select(CARD_SELECT).sort({ isFeatured: -1, createdAt: -1 }).limit(6)
            .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT }).lean().then(toCards),
    adPoint ? nearestListings({ point: adPoint, match: { _id: { $ne: selfId } }, limit: 12 }) : Promise.resolve([]),
    ad.userId?._id ? Listing.countDocuments({ userId: ad.userId._id, status: "approved" }) : Promise.resolve(0),
    // Alt text for each photo (written by the CDN's AI, or from the ad's model).
    galleryUrls.length ? Media.find({ url: { $in: galleryUrls } }).select("url alt").lean() : Promise.resolve([]),
  ]) as Promise<[any[], any[], number, any[]]>);
  const altByUrl = new Map((mediaAlts as any[]).map((m) => [m.url, m.alt as string]));
  const alts = galleryUrls.map((u, i) => altByUrl.get(u) || `${ad.name} — photo ${i + 1}`);
  const similar = JSON.parse(JSON.stringify(similarRaw));
  const shown = new Set(similar.map((a: any) => String(a._id)));
  // "Around this ad" answers a different question (what else is in that
  // neighbourhood), so drop anything already listed above.
  const nearby = JSON.parse(JSON.stringify(around.filter((a) => !shown.has(String(a._id))).slice(0, 6)));
  const areaLabel = ad.address || ad.city || "this area";
  const images = ad.galleryImages?.length ? ad.galleryImages : ad.mainImage ? [ad.mainImage] : [];
  const cat = ad.categoryId;

  // ── Specs ──
  // Key facts strip (the vertical's headline specs), then every other field
  // in the admin's order, then the feature checklist.
  const cfValues: Record<string, unknown> = ad.customFieldValues || {};
  const topId = ad.allCategoryIds?.[0] || (cat && !cat.parentCategoryId ? cat._id : null);
  const catalog = await getCatalog();
  const defs = await fieldDefsFor(topId);
  const keySpecs = specHighlights(cfValues, VERTICAL.keySpecs, 6);
  const inStrip = new Set(keySpecs.map((k) => k.field));
  const featureSlugs = new Set(VERTICAL.featureFields);
  const chain = (ad.allCategoryIds || []).map((id: string) => catalog.categoryById(id)).filter(Boolean) as { name: string }[];
  const details: { label: string; value: string }[] = [];
  // Make / model from the category chain (section → make → model).
  const make = chain[1]?.name;
  // A section can call its second level something else (Bakra Mandi: "Service" for qasai ads, not "Breed").
  const subLabel = VERTICAL.subLabels?.[(chain[0] as any)?.slug] || VERTICAL.brandWord.one;
  if (make) details.push({ label: subLabel.replace(/^./, (m) => m.toUpperCase()), value: make });
  // "Toyota Corolla" under Toyota reads as just "Corolla".
  const modelShort = chain[2]
    ? make && chain[2].name.toLowerCase().startsWith(make.toLowerCase() + " ") ? chain[2].name.slice(make.length + 1) : chain[2].name
    : undefined;
  if (modelShort) details.push({ label: "Model", value: modelShort });
  if (ad.condition) details.push({ label: "Condition", value: ad.condition.replace(/-/g, " ").replace(/\b\w/g, (m: string) => m.toUpperCase()) });
  const shownSlugs = new Set<string>();
  for (const d of defs) {
    shownSlugs.add(d.slug);
    if (inStrip.has(d.slug) || featureSlugs.has(d.slug)) continue;
    const value = displayValue(d, cfValues[d.slug]);
    if (value) details.push({ label: d.name, value });
  }
  // Values whose field was since removed or moved still belong to this ad.
  for (const [k, v] of Object.entries(cfValues)) {
    if (shownSlugs.has(k) || inStrip.has(k) || featureSlugs.has(k)) continue;
    const value = displayValue(undefined, v);
    if (value) details.push({ label: k.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase()), value });
  }
  const features: string[] = VERTICAL.featureFields.flatMap((f) => {
    const v = cfValues[f];
    return Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  });
  const refNo = String(ad._id).slice(-8).toUpperCase();

  const priceLabel = priceLabelOf(ad);
  const base = getBaseUrl();
  const url = `${base}/ads/${ad.slug}`;

  // Breadcrumb from the category path
  const crumbs: { name: string; url: string }[] = [{ name: "Home", url: base }];
  if (cat?.path) {
    const parts = cat.path.split("/");
    let acc = "";
    // Real category names ("Honda CD 70"), not prettified slugs ("Honda Cd 70").
    for (const p of parts) { acc = acc ? `${acc}/${p}` : p; crumbs.push({ name: catalog.categoryByPath(acc)?.name || p.replace(/-/g, " ").replace(/\b\w/g, (m: string) => m.toUpperCase()), url: `${base}/${acc}` }); }
  }
  crumbs.push({ name: ad.name, url });

  const PriceTitle = () => (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-[26px] font-bold text-content leading-none tracking-tight">{priceLabel}</span>
            {VERTICAL.priceStyle === "lakh" && ad.priceMode !== "free" && priceInWords(ad.price) && (
              <span className="text-sm font-medium text-content-tertiary">({priceInWords(ad.price)})</span>
            )}
            {ad.previousPrice != null && ad.price != null && ad.previousPrice > ad.price && (
              <span className="text-sm sm:text-base text-content-tertiary line-through font-normal">
                {formatPrice(ad.previousPrice)}
              </span>
            )}
            {ad.previousPrice != null && ad.price != null && ad.previousPrice > ad.price && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                📉 {formatPrice(ad.previousPrice - ad.price)} OFF
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {ad.isUrgent && (
            <span className="rounded-md bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1 shadow-xs">
              🔥 Urgent Sale
            </span>
          )}
          {ad.condition && (
            <span className="shrink-0 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary capitalize">
              {ad.condition.replace("-", " ")}
            </span>
          )}
        </div>
      </div>
      <h1 className="text-base sm:text-lg font-semibold text-content leading-snug">{ad.name}</h1>
      <div className="flex items-center justify-between gap-3 text-xs text-content-tertiary">
        <span className="flex items-center gap-1 font-normal text-content-secondary truncate min-w-0">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">{ad.address || ad.city || "Pakistan"}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0 ml-auto whitespace-nowrap text-content-tertiary" suppressHydrationWarning>
          <Calendar className="h-3.5 w-3.5" /> {formatDate(ad.createdAt)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="pb-28 md:pb-12 max-md:-mt-[var(--header-height)]">
      <JsonLd data={[listingJsonLd(ad, url, { make, model: modelShort }), breadcrumbJsonLd(crumbs)]} />
      <ViewBeacon id={String(ad._id)} />

      {/* Desktop breadcrumb */}
      <nav className="detail-wrap hidden md:flex items-center gap-1.5 text-xs text-content-secondary pt-4 pb-3 flex-wrap">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.url}>
            {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
            {i < crumbs.length - 1 ? (
              <Link href={c.url.replace(base, "") || "/"} className="hover:text-primary whitespace-nowrap">{c.name}</Link>
            ) : (
              <span className="text-content-tertiary truncate max-w-[240px]">{c.name}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      {(ad.status === "review" || ad.status === "rejected") && (
        <div className="detail-wrap detail-pad">
          <div className="mb-3 rounded-lg border-l-4 border-l-amber-500 border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 text-center shadow-xs">
            {ad.status === "review"
              ? "This ad is waiting for review. Only you and our team can see it until it's approved."
              : `This ad wasn't approved${ad.flagReasons?.[0] ? `: ${ad.flagReasons[0]}` : ""}. Only you and our team can see it — edit it to fix the problem.`}
          </div>
        </div>
      )}

      {(ad.status === "sold out" || ad.status === "expired") && (
        <div className="detail-wrap detail-pad">
          <div className="mb-3 rounded-lg border-l-4 border-l-amber-500 border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 text-center shadow-xs">
            {ad.status === "sold out" ? "This listing has been sold." : "This listing has expired."} See similar live listings below.
          </div>
        </div>
      )}

      {/* Centred on desktop (it used to span the whole screen, gallery flush
          against the left edge); the gallery stays full-bleed on phones. */}
      <div className="detail-wrap grid md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_370px] gap-3 md:gap-6 items-start">
        {/* Left / Main Column */}
        <div className="min-w-0 flex flex-col gap-3 md:gap-4">
          <Gallery
            images={images}
            alts={alts}
            title={ad.name}
            isFeatured={ad.isFeatured}
            adId={String(ad._id)}
            slug={ad.slug}
            videoUrl={ad.videoLink || ad.videoUrl || null}
            priceLabel={priceLabel}
            previousPriceLabel={ad.previousPrice != null && ad.price != null && ad.previousPrice > ad.price ? formatPrice(ad.previousPrice) : null}
            condition={ad.condition ? ad.condition.replace("-", " ") : null}
            city={ad.city || ad.address || null}
            siteName={siteName}
            isShop={!!(ad.userId?.isShop || (ad.userId?.verificationLevel || 0) >= 3)}
            sellerName={ad.userId?.isShop && ad.userId?.shopName ? ad.userId.shopName : ad.userId?.name}
          />

          {/* Price & title (phones; the sidebar shows it on desktop) */}
          <div className="md:hidden detail-pad"><PriceTitle /></div>
          {owner && <div className="md:hidden detail-pad"><OwnerPanel o={owner} /></div>}
          {booking && !owner && <div className="md:hidden detail-pad"><BookingBox b={booking} /></div>}

          {/* Key facts — the specs every buyer checks first */}
          {keySpecs.length > 0 && (
            <div className="detail-pad">
              {/* 1px gaps over the border colour draw the dividers at any column count. */}
              <div className={cn("grid gap-px rounded-2xl border border-card-border bg-card-border shadow-xs overflow-hidden",
                keySpecs.length === 4 ? "grid-cols-2 sm:grid-cols-4" : keySpecs.length <= 2 ? "grid-cols-2" : "grid-cols-3")}>
                {keySpecs.map((k, i) => {
                  const Icon = iconFor(k.icon);
                  // Five facts on three columns: the last one fills the row.
                  const fill = keySpecs.length === 5 && i === 4;
                  return (
                    <div key={k.field} className={cn("bg-card flex flex-col items-center justify-center text-center gap-1 px-2 py-3.5 sm:py-4", fill && "col-span-2")}>
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary stroke-[1.7]" aria-hidden />
                      <div className="text-[14px] sm:text-[15px] font-bold text-content leading-tight tracking-tight">{k.value}</div>
                      <div className="text-[11px] text-content-tertiary leading-none">{k.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Details table */}
          {details.length > 0 && (
            <div className="detail-pad">
              <div className="rounded-lg sm:rounded-xl border border-card-border bg-card p-4 sm:p-5 shadow-xs">
                <SectionLabel>{VERTICAL.noun.One} details</SectionLabel>
                <dl className="mt-2 grid sm:grid-cols-2 sm:gap-x-8">
                  {details.map((d, i) => (
                    <div key={`${d.label}-${i}`} className="flex items-baseline justify-between gap-4 border-b border-card-border/70 py-2.5 text-sm">
                      <dt className="text-content-secondary shrink-0">{d.label}</dt>
                      <dd className="font-semibold text-content text-right min-w-0 break-words">{d.value}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-4 border-b border-card-border/70 py-2.5 text-sm">
                    <dt className="text-content-secondary">Ad ref #</dt>
                    <dd className="font-mono text-xs text-content-secondary">{refNo}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {/* Features checklist */}
          {features.length > 0 && (
            <div className="detail-pad">
              <div className="rounded-lg sm:rounded-xl border border-card-border bg-card p-4 sm:p-5 shadow-xs">
                <SectionLabel>Features</SectionLabel>
                <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-content">
                      <span className="grid place-items-center h-[18px] w-[18px] rounded-full bg-primary/10 text-primary shrink-0"><Check className="h-3 w-3 stroke-[3]" /></span>
                      <span className="min-w-0">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="detail-pad">
            <div className="rounded-lg sm:rounded-xl border border-card-border bg-card p-4 sm:p-5 shadow-xs">
              <SectionLabel>Description</SectionLabel>
              <p className="mt-2 text-sm text-content-secondary leading-relaxed whitespace-pre-line">{ad.description || "No description provided."}</p>
            </div>
          </div>
        </div>

        {/* Right / sidebar */}
        <aside className="flex flex-col gap-3">
          {/* Desktop price + actions sticky panel */}
          <div className="hidden md:block">
            <div className="rounded-xl border border-card-border bg-card p-5 flex flex-col gap-4 shadow-xs">
              <PriceTitle />
              {owner && <OwnerPanel o={owner} />}
              {booking && !owner && <BookingBox b={booking} />}
              {!owner && <DetailActions
                booking={booking && !booking.full ? { href: booking.href, cta: booking.cta } : null}
                adId={ad._id} sellerId={ad.userId?._id} price={ad.price} priceLabel={priceLabel}
                title={ad.name} slug={ad.slug} loggedIn={loggedIn}
                whatsapp={loggedIn ? ad.whatsappNumber : null} phone={loggedIn ? ad.contactNumber : null}
                siteName={siteName}
              />}
              {!owner && <AdvanceWarning />}
            </div>
          </div>

          {/* Seller Information */}
          <div className="detail-pad">
            <div className="rounded-lg sm:rounded-xl border border-card-border bg-card p-4 sm:p-5 flex flex-col gap-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <SectionLabel>Seller Information</SectionLabel>
                <Link href={`/shop/${ad.userId?._id}`} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
                  <span>View profile</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="flex items-center gap-3.5">
                <Link href={`/shop/${ad.userId?._id}`} className="shrink-0">
                  {ad.userId?.profileImage ? (
                    <img src={ad.userId.profileImage} alt="" className="h-12 w-12 rounded-full object-cover border border-card-border" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-700 grid place-items-center font-bold text-base border border-slate-200">
                      {ad.userId?.name?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/shop/${ad.userId?._id}`} className="font-bold text-content hover:text-primary truncate text-base">
                      {ad.userId?.isShop && ad.userId?.shopName ? ad.userId.shopName : ad.userId?.name || "Seller"}
                    </Link>
                    <TrustMark user={ad.userId} size={15} />
                  </div>

                  <div className="text-xs text-content-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-content">
                      {ad.userId?.isShop || (ad.userId?.verificationLevel || 0) >= 3 ? "Verified Shop" : "Direct Owner"}
                    </span>
                    <span>·</span>
                    <span>{sellerLiveCount} active {sellerLiveCount === 1 ? "ad" : "ads"}</span>
                  </div>

                  <div className="text-xs text-content-tertiary mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>Member since {new Date(ad.userId?.createdAt || Date.now()).getFullYear()}</span>
                    {ad.userId?.rating ? (
                      <>
                        <span>·</span>
                        <span className="text-amber-500 font-medium">★ {Number(ad.userId.rating).toFixed(1)}</span>
                        {ad.userId.ratingCount ? <span>({ad.userId.ratingCount})</span> : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-card-border/60">
                <div className="flex items-center gap-1.5 text-xs text-content-secondary">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{VERTICAL.copy.inspectTip}</span>
                </div>
                <ReportButton type="listing" itemId={String(ad._id)} label="Report" />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="detail-pad">
            <div className="rounded-lg sm:rounded-xl border border-card-border bg-card p-4 sm:p-5 flex flex-col gap-3 shadow-xs">
              <SectionLabel>Location</SectionLabel>
              <div className="flex items-center gap-2 text-sm text-content-secondary">
                <MapPin className="h-4 w-4 text-primary shrink-0" /> {ad.address || ad.city || "Pakistan"}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Similar — nearest to the visitor */}
      {similar.length > 0 && (
        <div className="detail-wrap detail-pad mt-8">
          <h2 className="text-base sm:text-lg font-bold text-content">{loc.point ? "Similar ads near you" : "Similar listings"}</h2>
          {loc.point && <p className="text-xs text-content-tertiary mt-0.5 mb-3">Closest to {loc.precise ? "you" : loc.label} first</p>}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${loc.point ? "" : "mt-3"}`}>
            {similar.map((item: any) => <ListingCard key={item._id} ad={item} />)}
          </div>
        </div>
      )}

      {/* Around this ad — what else is in that neighbourhood */}
      {nearby.length > 0 && (
        <div className="detail-wrap detail-pad mt-8">
          <h2 className="text-base sm:text-lg font-bold text-content">More ads around {areaLabel}</h2>
          <p className="text-xs text-content-tertiary mt-0.5 mb-3">Distances are from this listing</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {nearby.map((item: any) => <ListingCard key={item._id} ad={item} />)}
          </div>
        </div>
      )}
    </div>
  );
}
