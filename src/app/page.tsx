import React from "react";
import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { getCatalog } from "@/lib/catalog";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { ListingCard, ListingGrid } from "@/components/ListingCard";
import { SectionThumb } from "@/components/home/SectionThumb";
import { getSectionCovers } from "@/lib/section-covers";
import { IntentLink } from "@/components/IntentLink";
import { HomeSlider } from "@/components/home/HomeSlider";
import { EventBanner } from "@/components/home/EventBanner";
import { CARD_SELECT, CARD_SELLER_SELECT, toCards } from "@/lib/listing-card";
import { nearestListings, boostedNear } from "@/lib/geo-feed";
import { getScopeCounts } from "@/lib/scope-counts";
import { TtlLru } from "@/lib/memo";
import { getVisitorLocation, oid, type VisitorLocation } from "@/lib/visitor-location";
import { getSettings } from "@/lib/settings";
import { getHomepageSections, getLocalHomepageSections, getHomeSliders } from "@/lib/home-content";
import { siteJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { needsSetup } from "@/lib/setup-state";
import { VERTICAL } from "@/vertical";
import { iconFor } from "@/vertical/icons";


/**
 * How many cards each section renders. Every card is DOM the phone has to
 * style and lay out; with ~30 on the page that cost ~0.6 s of layout + ~0.6 s
 * of style recalculation on a mid-range phone (measured). Each section has a
 * "View all", so the home shows a taste, not the whole catalogue.
 */
const HOME = { featured: 4, nearYou: 12, nearby: 8, rail: 4 };

/** A category rail only earns its place once the city has real depth in it. */
const RAIL_MIN_ADS = 6;

type Rail = { title: string; href: string; ads: any[] };

/**
 * OLX-style personalised home. With a location:
 *   · everything is scoped to the visitor's city, ordered by real distance
 *     from them (GPS, else their area, else the city centre)
 *   · category tiles + area chips show live counts for that city
 *   · a thin city widens by distance into the nearest other cities — never
 *     an empty page, never Karachi first for someone in Lahore
 * Without one, it's the national newest-first home.
 */
async function getHomeData(loc: VisitorLocation) {
  await dbConnect();

  // Categories, cities and area names come from the cached catalog.
  const catalog = await getCatalog();
  const categoriesRaw = catalog.topCategories();
  const cities = catalog.cities.slice(0, 12).map((c) => ({ name: c.name, slug: c.slug }));

  // Live counts (categories, areas, city total) come from the shared scope
  // counts — no per-visit group-by over the whole listings table.
  const scope = await getScopeCounts();

  // ── National home ─────────────────────────────────────────────────────
  // Identical for every visitor without a location, so it's built once and
  // shared for a few seconds (a traffic spike on "/" = one query, not 10,000).
  if (!loc.city || !loc.point) {
    const { recent, featured } = await nationalFeed.memo("home", async () => {
      const now = new Date();
      const [recent, featured] = await Promise.all([
        Listing.find({ status: "approved" }).select(CARD_SELECT).sort({ isFeatured: -1, createdAt: -1 }).limit(HOME.nearYou)
          .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT }).maxTimeMS(5000).lean(),
        Listing.find({ status: "approved", isFeatured: true, $or: [{ featuredExpiresAt: null }, { featuredExpiresAt: { $gt: now } }] })
          .select(CARD_SELECT).sort({ createdAt: -1 }).limit(HOME.featured)
          .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT }).maxTimeMS(5000).lean(),
      ]);
      return { recent: toCards(recent), featured: toCards(featured) };
    });
    const counts = scope.cat;
    return {
      local: false as const,
      categories: plainCats(categoriesRaw, counts, ""),
      makes: topMakes(catalog, (id) => counts.get(id) || 0, ""),
      cities: JSON.parse(JSON.stringify(cities)),
      featured,
      nearYou: recent,
      nearbyCities: [] as any[],
      areas: [] as { name: string; slug: string; n: number }[],
      rails: [] as Rail[],
      cityTotal: 0,
    };
  }


  // ── Personalised home ─────────────────────────────────────────────────
  const point = loc.point;
  const cityId = oid(loc.city._id);
  const inCity = { "locationRefs.cityId": cityId };

  // One parallel wave. "Nearby cities" is fetched alongside rather than after
  // (it's only shown when the city is thin, but waiting to find that out cost
  // a whole extra round trip on every personalised home view).
  const cityKey = String(loc.city._id);
  const cityTotal = scope.city.get(cityKey) || 0;
  const counts = new Map<string, number>();
  for (const c of categoriesRaw) counts.set(String(c._id), scope.cityCat.get(`${cityKey}:${c._id}`) || 0);

  // "Nearby cities" only fills in for a thin city — and the counts say so up
  // front. (Run always, $geoNear walks past every ad in a big city before it
  // reaches the next one: 0.75 s for Lahore at 300k ads.)
  const thin = cityTotal < HOME.nearYou;
  const [nearYou, featured, nearbyAll] = await Promise.all([
    nearestListings({ point, match: inCity, limit: HOME.nearYou, sizeHint: cityTotal }),
    // Boosted ads are few: read them by index and sort by distance in code.
    boostedNear({ point }, HOME.featured),
    thin ? nearestListings({ point, match: { "locationRefs.cityId": { $ne: cityId } }, limit: HOME.nearby }) : Promise.resolve([]),
  ]);

  // A thin city widens by distance into the nearest other cities.
  const nearbyCities = nearYou.length < HOME.nearYou ? nearbyAll : [];

  // Area chips (OLX's location facet), busiest first — names from the catalog.
  const areas = Array.from(scope.cityAreas.get(cityKey) || [], ([areaId, n]) => {
      const area = catalog.areaById(areaId);
      return area ? { name: area.name, slug: area.slug, n } : null;
    })
    .filter((a): a is { name: string; slug: string; n: number } => !!a)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, 14);

  // Category rails, nearest-first, only where the city has depth.
  const railCats = (categoriesRaw as any[])
    .filter((c) => (counts.get(String(c._id)) || 0) >= RAIL_MIN_ADS)
    .sort((a, b) => (counts.get(String(b._id)) || 0) - (counts.get(String(a._id)) || 0))
    .slice(0, 3);
  const rails: Rail[] = await Promise.all(
    railCats.map(async (c) => ({
      title: `${c.name} near you`,
      href: `/${loc.city!.slug}/${c.path}`,
      ads: await nearestListings({ point, match: { ...inCity, allCategoryIds: String(c._id) }, limit: HOME.rail, sizeHint: counts.get(String(c._id)) }),
    }))
  );

  return {
    local: true as const,
    categories: plainCats(categoriesRaw, counts, `/${loc.city.slug}`),
    makes: topMakes(catalog, (id) => scope.cityCat.get(`${cityKey}:${id}`) || 0, `/${loc.city.slug}`),
    cities: JSON.parse(JSON.stringify(cities)),
    featured,
    nearYou,
    nearbyCities,
    areas,
    rails,
    cityTotal,
  };
}

const nationalFeed = new TtlLru<{ recent: any[]; featured: any[] }>(1, 10_000);

/**
 * Everyone browsing from the same area without GPS sees the same home, so its
 * data is built once per area every 10 s and shared — a busy area's home is
 * then pure rendering, no database work. (GPS visitors get their own entry,
 * keyed by their exact point, so distances stay exact.)
 */
const homeByPlace = new TtlLru<Awaited<ReturnType<typeof getHomeData>>>(400, 10_000);
function cachedHomeData(loc: VisitorLocation) {
  const key = [loc.city?.slug ?? "", loc.area?.slug ?? "", loc.precise && loc.point ? loc.point.join(",") : ""].join("|");
  return homeByPlace.memo(key, () => getHomeData(loc));
}

type Make = { name: string; href: string; count: number };

/** The main section's makes (Toyota, Honda…), busiest first — or in the admin's order on a new site. */
function topMakes(catalog: Awaited<ReturnType<typeof getCatalog>>, countOf: (id: string) => number, prefix: string): Make[] {
  const top = catalog.categoryByPath(VERTICAL.primaryTop);
  if (!top) return [];
  const all = catalog.childrenOf(top._id).map((c) => ({ name: c.name, href: `${prefix}/${c.path}`, count: countOf(String(c._id)), seq: Number(c.sequence ?? 99) }));
  const live = all.filter((m) => m.count > 0);
  const list = live.length >= 4 ? live.sort((a, b) => b.count - a.count || a.seq - b.seq) : all.sort((a, b) => a.seq - b.seq);
  return list.slice(0, 12).map(({ name, href, count }) => ({ name, href, count }));
}

function plainCats(raw: any[], counts: Map<string, number>, prefix: string) {
  return JSON.parse(JSON.stringify(raw)).map((c: any) => ({
    ...c,
    count: counts.get(String(c._id)) || 0,
    href: `${prefix}/${c.path}`,
  }));
}

export const dynamic = "force-dynamic";

export default async function Home() {
  // A brand-new install has no admin yet: send the owner to first-run setup.
  if (await needsSetup().catch(() => false)) redirect("/setup");
  const loc = await getVisitorLocation();
  const [data, settings, siteLd, sections, rawSliders, covers] = await Promise.all([
    cachedHomeData(loc).catch((e) => { console.error("Home data error:", e); return null; }),
    getSettings(), siteJsonLd(),
    // Admin rails follow the visitor too: nearest first, other cities only to fill.
    loc.city && loc.point
      ? getLocalHomepageSections([loc.city.slug, loc.area?.slug ?? "", loc.precise ? loc.point.join(",") : ""].join("|"), loc.point)
      : getHomepageSections(),
    getHomeSliders(), getSectionCovers(),
  ]);

  const sliders = JSON.parse(JSON.stringify(rawSliders || []));

  const d = data ?? {
    local: false as const, categories: [], makes: [] as Make[], cities: [], featured: [], nearYou: [],
    nearbyCities: [], areas: [], rails: [] as Rail[], cityTotal: 0,
  };
  const city = loc.city;
  // Featured is strictly the visitor's own city; none there → no section.
  if (d.local && city) d.featured = d.featured.filter((ad: any) => String(ad.city || "").toLowerCase() === city.name.toLowerCase());
  const prefix = city ? `/${city.slug}` : "";
  const cityHref = city ? `/${city.slug}` : `/${VERTICAL.primaryTop}`;
  const EmptyIcon = iconFor(VERTICAL.icon);
  const fromWhere = loc.precise ? "your location" : loc.area ? loc.area.name : city?.name;

  return (
    <div className="pb-6">
      <JsonLd data={siteLd} />

      <EventBanner
        name={settings.event_name} date={settings.event_date} note={settings.event_note}
        title={settings.hero_title} subtitle={settings.hero_subtitle} prefix={prefix}
      />

      {/* Admin banners (Admin → Homepage sliders), when there are any */}
      {sliders.length > 0 && <div className="wrap pt-4"><HomeSlider sliders={sliders} /></div>}

      {/* Sections */}
      {d.categories.length > 0 && (
        <section className="pt-5">
          {/* One swipeable row of round section photos (all fit on desktop). */}
          <div className="wrap flex gap-3.5 sm:gap-5 overflow-x-auto hide-scrollbar snap-x scroll-px-4 md:scroll-px-6 lg:justify-between">
            {d.categories.map((c: any) => (
              <IntentLink key={c._id} href={c.href} className="group snap-start shrink-0 w-[76px] sm:w-[92px] flex flex-col items-center text-center gap-1.5">
                <SectionThumb src={covers[c.slug]} icon={c.icon} sizes="96px"
                  className="h-[68px] w-[68px] sm:h-[84px] sm:w-[84px] rounded-full ring-2 ring-white shadow-md group-hover:ring-primary transition" />
                <span className="text-[13px] sm:text-[14px] font-semibold text-content leading-tight line-clamp-2">{c.name}</span>
              </IntentLink>
            ))}
          </div>
        </section>
      )}

      {/* Featured — a swipeable row on phones */}
      {d.featured.length > 0 && (
        <section className="pt-8">
          <div className="wrap"><SectionHead title={d.local ? "Featured near you" : "Featured"} href={cityHref} /></div>
          <div className="wrap max-sm:!px-0">
            <div className="max-sm:flex max-sm:overflow-x-auto max-sm:snap-x max-sm:snap-mandatory max-sm:px-4 max-sm:gap-2.5 hide-scrollbar sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
              {d.featured.map((ad: any, i: number) => (
                <div key={ad._id} className="max-sm:w-[46vw] max-sm:shrink-0 max-sm:snap-start flex">
                  <ListingCard ad={ad} priority={i < 2} className="w-full" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Main feed */}
      <section className="wrap pt-8">
        <SectionHead
          title={d.local ? `Near ${fromWhere === "your location" ? "you" : fromWhere}` : "Latest"}
          sub={d.local ? `${city!.name} · closest first` : undefined}
          href={cityHref}
        />
        {d.nearYou.length > 0 ? (
          <ListingGrid ads={d.nearYou} priorityCount={d.featured.length ? 0 : 2} />
        ) : d.nearbyCities.length === 0 ? (
          <div className="card p-10 text-center">
            <span className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-primary-soft text-primary"><EmptyIcon className="h-7 w-7" /></span>
            <h3 className="mt-4 text-base font-bold text-content">No ads yet</h3>
            <p className="text-sm text-content-secondary mt-1">Be the first to post{city ? ` in ${city.name}` : ""}.</p>
            <Link href="/ads/post" className="mt-5 inline-flex items-center h-11 px-6 rounded-full bg-primary hover:bg-primary-dark text-white font-bold text-sm">{VERTICAL.copy.sellCta}</Link>
          </div>
        ) : (
          <p className="card px-4 py-3.5 text-sm text-content-secondary">
            No ads in {city!.name} yet — here are the closest from nearby cities.
          </p>
        )}
      </section>

      {/* Section rails (only where the city has depth) */}
      {d.rails.map((r) => r.ads.length > 0 && (
        <section key={r.href} className="wrap pt-8">
          <SectionHead title={r.title} href={r.href} />
          <ListingGrid ads={r.ads} />
        </section>
      ))}

      {/* Thin city → widen by distance */}
      {d.nearbyCities.length > 0 && (
        <section className="wrap pt-8">
          <SectionHead title="From nearby cities" sub={`Closest first from ${city!.name}`} href={`/${VERTICAL.primaryTop}`} />
          <ListingGrid ads={d.nearbyCities} />
        </section>
      )}

      {/* Admin feature rails */}
      {sections.map((sec: any) => (
        sec.listings?.length ? (
          <section key={sec._id} className="wrap pt-8">
            <SectionHead title={sec.title} href={cityHref} />
            <ListingGrid ads={sec.listings} />
          </section>
        ) : null
      ))}
    </div>
  );
}

function SectionHead({ title, sub, href }: { title: string; sub?: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3.5">
      <div className="min-w-0">
        <h2 className="text-[18px] sm:text-[21px] font-extrabold tracking-tight text-content truncate">{title}</h2>
        {sub && <p className="text-[13.5px] text-content-tertiary mt-0.5 truncate">{sub}</p>}
      </div>
      {href && (
        <IntentLink href={href} className="shrink-0 inline-flex items-center gap-0.5 text-[14px] font-bold text-primary hover:text-primary-dark">
          See all <ChevronRight className="h-4 w-4" />
        </IntentLink>
      )}
    </div>
  );
}
