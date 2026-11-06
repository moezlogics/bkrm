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
import { MapPin, Clock3, ChevronRight, ShieldCheck, CircleCheck, Info, CalendarDays, Weight, Ruler, VenusAndMars, Palette, Warehouse, Users, MoonStar } from "lucide-react";
import Link from "next/link";
import { DetailActions } from "./DetailActions";
import { BookingBox } from "@/components/bookings/BookingBox";
import { OwnerPanel, type OwnerInfo } from "@/components/ads/OwnerPanel";
import { getEntitlements } from "@/lib/plan";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { bookingSummary } from "@/lib/bookings/server";
import { Gallery } from "./Gallery";
import { ViewBeacon } from "./ViewBeacon";
import { ListingGrid } from "@/components/ListingCard";
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
  return <h2 className="text-[17px] font-extrabold text-content">{children}</h2>;
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

  const dropped = ad.previousPrice != null && ad.price != null && ad.previousPrice > ad.price;
  const sellerName = ad.userId?.isShop && ad.userId?.shopName ? ad.userId.shopName : ad.userId?.name || "Seller";
  const isShop = !!(ad.userId?.isShop || (ad.userId?.verificationLevel || 0) >= 3);
  const statusNote = ad.status === "review" || ad.status === "rejected" || ad.status === "sold out" || ad.status === "expired";

  const PriceTitle = () => (
    <div>
      {(ad.isUrgent || ad.isFeatured || chain[0]) && (
        <div className="mb-2 flex items-center gap-1.5 flex-wrap">
          {ad.isUrgent && <span className="h-6 px-2.5 rounded-md bg-danger text-white text-[12px] font-bold inline-flex items-center">Urgent sale</span>}
          {ad.isFeatured && <span className="h-6 px-2.5 rounded-md bg-secondary-light text-amber-950 text-[12px] font-bold inline-flex items-center">Featured</span>}
          {chain[0] && <span className="h-6 px-2.5 rounded-md bg-primary-soft text-primary-dark text-[12px] font-bold inline-flex items-center">{chain.slice(0, 2).map((c) => c.name).join(" · ")}</span>}
        </div>
      )}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[30px] font-extrabold text-content leading-none tracking-tight">{priceLabel}</span>
        {dropped && <span className="text-[17px] text-content-tertiary line-through">{formatPrice(ad.previousPrice)}</span>}
        {VERTICAL.priceStyle === "lakh" && ad.priceMode !== "free" && priceInWords(ad.price) && (
          <span className="text-[15px] font-semibold text-content-tertiary">{priceInWords(ad.price)}{ad.priceMode === "negotiable" ? " · Negotiable" : ""}</span>
        )}
      </div>
      <h1 className="mt-2 text-[19px] font-bold text-content leading-snug">{ad.name}</h1>
      <div className="mt-1.5 flex items-center gap-3 text-[14.5px] text-content-secondary">
        <span className="flex items-center gap-1 min-w-0"><MapPin className="h-[17px] w-[17px] text-primary shrink-0 stroke-[2.4]" /><span className="truncate">{ad.address || ad.city || "Pakistan"}</span></span>
        <span className="flex items-center gap-1 shrink-0 ml-auto text-content-tertiary" suppressHydrationWarning><Clock3 className="h-[17px] w-[17px] stroke-[2.2]" />{formatDate(ad.createdAt)}</span>
      </div>
    </div>
  );

  return (
    <div className="pb-24 md:pb-12 max-md:-mt-[var(--header-height)]">
      <JsonLd data={[listingJsonLd(ad, url, { make, model: modelShort }), breadcrumbJsonLd(crumbs)]} />
      <ViewBeacon id={String(ad._id)} />

      {/* Desktop breadcrumb */}
      <nav className="detail-wrap hidden md:flex items-center gap-1 text-[14px] text-content-tertiary pt-4 pb-3 flex-wrap">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.url}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            {i < crumbs.length - 1 ? (
              <Link href={c.url.replace(base, "") || "/"} className="hover:text-primary whitespace-nowrap">{c.name}</Link>
            ) : (
              <span className="text-content-secondary truncate max-w-[280px]">{c.name}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="detail-wrap grid md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px] gap-2 md:gap-5 items-start">
        {/* Main column: on phones one solid sheet of full-width blocks with
            thin grey gaps; on desktop the blocks become cards. */}
        <div className="min-w-0 flex flex-col gap-2 md:gap-3">
          <Gallery
            images={images}
            alts={alts}
            title={ad.name}
            isFeatured={ad.isFeatured}
            adId={String(ad._id)}
            slug={ad.slug}
            videoUrl={ad.videoLink || ad.videoUrl || null}
            priceLabel={priceLabel}
            previousPriceLabel={dropped ? formatPrice(ad.previousPrice) : null}
            condition={ad.condition ? ad.condition.replace("-", " ") : null}
            city={ad.city || ad.address || null}
            siteName={siteName}
            isShop={isShop}
            sellerName={sellerName}
          />

          {statusNote && <StatusNote status={ad.status} reason={ad.flagReasons?.[0]} />}

          {/* Price & title (phones; the sidebar shows it on desktop) */}
          <Block className="md:hidden -mt-2 md:mt-0">
            <PriceTitle />
            {owner && <div className="mt-3"><OwnerPanel o={owner} /></div>}
            {booking && !owner && <div className="mt-3"><BookingBox b={booking} /></div>}
          </Block>

          {/* Overview: key facts, then every other detail */}
          {(keySpecs.length > 0 || details.length > 0) && (
            <Block>
              <SectionLabel>Overview</SectionLabel>
              {keySpecs.length > 0 && (
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-x-3 gap-y-4">
                  {keySpecs.map((k) => {
                    const Icon = SPEC_ICON[k.field] || iconFor(k.icon);
                    return (
                      <div key={k.field} className="flex items-start gap-2 min-w-0">
                        <Icon className="h-[22px] w-[22px] text-primary shrink-0 stroke-[2.3] mt-0.5" aria-hidden />
                        <div className="min-w-0">
                          <div className="text-[12.5px] text-content-tertiary leading-tight">{k.label.replace(/\s*\(.*\)/, "")}</div>
                          <div className="text-[15.5px] font-bold text-content leading-tight mt-0.5 break-words">{k.value.replace(/\s*\(.*\)/, "")}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {details.length > 0 && (
                <dl className={cn("grid sm:grid-cols-2 sm:gap-x-8", keySpecs.length > 0 && "mt-3 border-t border-card-border")}>
                  {details.map((d, i) => (
                    <div key={`${d.label}-${i}`} className="flex items-baseline justify-between gap-4 border-b border-card-border/70 py-2.5 text-[15px]">
                      <dt className="text-content-secondary shrink-0">{d.label}</dt>
                      <dd className="font-semibold text-content text-right min-w-0 break-words">{d.value}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-4 py-2.5 text-[15px]">
                    <dt className="text-content-secondary">Ad ID</dt>
                    <dd className="font-mono text-[14px] text-content-tertiary">{refNo}</dd>
                  </div>
                </dl>
              )}
            </Block>
          )}

          {/* Highlights */}
          {features.length > 0 && (
            <Block>
              <SectionLabel>Highlights</SectionLabel>
              <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[15px] font-medium text-content min-w-0">
                    <CircleCheck className="h-5 w-5 text-primary shrink-0 stroke-[2.4]" />
                    <span className="min-w-0">{f}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {/* Description */}
          <Block>
            <SectionLabel>Description</SectionLabel>
            <p className="mt-2 text-[15.5px] text-content-secondary leading-relaxed whitespace-pre-line break-words">{ad.description || "No description provided."}</p>
          </Block>
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-2 md:gap-3 md:sticky md:top-[calc(var(--header-height)+12px)]">
          <div className="hidden md:block">
            <Block className="flex flex-col gap-3.5">
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
            </Block>
          </div>

          {/* Seller */}
          <Block>
            <Link href={`/shop/${ad.userId?._id}`} className="flex items-center gap-3 group">
              {ad.userId?.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ad.userId.profileImage} alt="" className="h-12 w-12 rounded-full object-cover shrink-0" />
              ) : (
                <span className="h-12 w-12 rounded-full bg-primary text-white grid place-items-center font-extrabold text-lg shrink-0">
                  {sellerName[0]?.toUpperCase() || "S"}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-content group-hover:text-primary truncate text-[16px]">{sellerName}</span>
                  <TrustMark user={ad.userId} size={17} />
                </span>
                <span className="block text-[14px] text-content-secondary">
                  {isShop ? "Farm / shop" : "Individual seller"} · {sellerLiveCount} {sellerLiveCount === 1 ? "ad" : "ads"}{ad.userId?.rating ? ` · ${Number(ad.userId.rating).toFixed(1)} rating` : ""}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-content-tertiary shrink-0 stroke-[2.4]" />
            </Link>
            <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-card-border">
              <p className="flex items-start gap-2 text-[14px] text-content-secondary leading-snug">
                <ShieldCheck className="h-[18px] w-[18px] text-primary shrink-0 stroke-[2.3]" />
                <span>{VERTICAL.copy.inspectTip}</span>
              </p>
              <ReportButton type="listing" itemId={String(ad._id)} label="Report" />
            </div>
          </Block>
        </aside>
      </div>

      {/* Similar — nearest to the visitor */}
      {similar.length > 0 && (
        <section className="detail-wrap detail-pad mt-6">
          <h2 className="text-[20px] font-extrabold tracking-tight text-content">{loc.point ? "Similar near you" : "Similar ads"}</h2>
          <div className="mt-3"><ListingGrid ads={similar} className="lg:!grid-cols-4 xl:!grid-cols-4" /></div>
        </section>
      )}

      {/* Around this ad */}
      {nearby.length > 0 && (
        <section className="detail-wrap detail-pad mt-6">
          <h2 className="text-[20px] font-extrabold tracking-tight text-content">More around {ad.city || areaLabel}</h2>
          <div className="mt-3"><ListingGrid ads={nearby} className="lg:!grid-cols-4 xl:!grid-cols-4" /></div>
        </section>
      )}
    </div>
  );
}

/** Bold, modern line icons for the headline specs (the vertical's own icon otherwise). */
const SPEC_ICON: Record<string, React.ElementType> = {
  age: CalendarDays, weight_kg: Weight, height_in: Ruler, gender: VenusAndMars, colour: Palette,
  kept_at: Warehouse, share_animal: Users, shares_left: Users, qurbani_day: MoonStar,
};

/** One section of the ad page: a full-width white block on phones, a card on desktop. */
function Block({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("bg-white px-4 py-3.5 md:px-5 md:py-4 md:rounded-2xl md:shadow-sm md:ring-1 md:ring-black/[0.03]", className)}>{children}</section>;
}

function StatusNote({ status, reason }: { status: string; reason?: string }) {
  const text = status === "review"
    ? "This ad is waiting for review. Only you and our team can see it until it's approved."
    : status === "rejected"
      ? `This ad wasn't approved${reason ? `: ${reason}` : ""}. Only you and our team can see it — edit it to fix the problem.`
      : status === "sold out" ? "This animal has been sold. Similar live ads are below." : "This ad has expired. Similar live ads are below.";
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 md:rounded-2xl px-4 py-3 text-[14.5px] font-semibold text-amber-900">
      <Info className="h-[18px] w-[18px] shrink-0 mt-px stroke-[2.4]" /> {text}
    </div>
  );
}
