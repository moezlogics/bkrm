import React from "react";
import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { getCatalog } from "@/lib/catalog";
import { ArrowRight, MapPin, Navigation, Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { ListingCard } from "@/components/ListingCard";
import { IntentLink } from "@/components/IntentLink";
import { HomeSlider } from "@/components/home/HomeSlider";
import { EventBanner } from "@/components/home/EventBanner";
import { CARD_SELECT, CARD_SELLER_SELECT, toCards } from "@/lib/listing-card";
import { nearestListings, boostedNear } from "@/lib/geo-feed";
import { getScopeCounts } from "@/lib/scope-counts";
import { TtlLru } from "@/lib/memo";
import { getVisitorLocation, oid, type VisitorLocation } from "@/lib/visitor-location";
import { getSettings } from "@/lib/settings";
import { getHomepageSections, getHomeSliders } from "@/lib/home-content";
import { siteJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { SearchBox } from "@/components/search/SearchBox";
import { withBasePath } from "@/lib/base-path";
import { needsSetup } from "@/lib/setup-state";
import { VERTICAL } from "@/vertical";
import { iconFor } from "@/vertical/icons";
import { priceInWords } from "@/lib/utils";


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
  const [data, settings, siteLd, sections, rawSliders] = await Promise.all([
    cachedHomeData(loc).catch((e) => { console.error("Home data error:", e); return null; }),
    getSettings(), siteJsonLd(), getHomepageSections(),
    getHomeSliders(),
  ]);

  const sliders = JSON.parse(JSON.stringify(rawSliders || []));

  const d = data ?? {
    local: false as const, categories: [], makes: [] as Make[], cities: [], featured: [], nearYou: [],
    nearbyCities: [], areas: [], rails: [] as Rail[], cityTotal: 0,
  };
  const city = loc.city;
  const primaryHref = city ? `/${city.slug}/${VERTICAL.primaryTop}` : `/${VERTICAL.primaryTop}`;
  const cityHref = city ? `/${city.slug}` : primaryHref;
  const primaryCat = d.categories.find((c: any) => c.path === VERTICAL.primaryTop);
  const EmptyIcon = iconFor(VERTICAL.icon);
  const fromWhere = loc.precise ? "your location" : loc.area ? loc.area.name : city?.name;

  return (
    <div className="pb-mobile-nav">
      <JsonLd data={siteLd} />

      {/* Homepage Slider Banner from Admin Panel */}
      <HomeSlider sliders={sliders} />

      {/* The site's event (Eid ul Adha on a bakra mandi): countdown + quick links */}
      <EventBanner name={settings.event_name} date={settings.event_date} note={settings.event_note} />


      {/* Areas in the visitor's city (OLX's location facet) */}
      {d.local && d.areas.length > 0 && (
        <section className="wrap pb-3">
          <p className="mb-2 text-xs font-semibold text-content-secondary flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-primary" /> Areas in {city!.name}
          </p>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1 pb-1">
            {d.areas.map((a) => {
              const isHome = loc.area?.slug === a.slug;
              return (
                <IntentLink
                  key={a.slug}
                  href={`/${city!.slug}/${a.slug}`}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isHome ? "border-primary bg-primary/8 text-primary" : "border-card-border bg-surface text-content-secondary hover:border-primary hover:text-primary"
                  }`}
                >
                  {a.name} <span className="text-content-tertiary">({a.n})</span>
                </IntentLink>
              );
            })}
          </div>
        </section>
      )}

      {/* Featured — nearest boosted ads */}
      {d.featured.length > 0 && (
        <section className="wrap py-4">
          <SectionHead title={d.local ? "Featured near you" : "Featured"} href={cityHref} accent />
          <Grid ads={d.featured} priorityCount={2} />
        </section>
      )}

      {/* Browse by make */}
      {d.makes.length > 0 && (
        <section className="wrap py-4">
          <SectionHead title={`Browse by ${VERTICAL.brandWord.one}`} href={primaryHref} />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {d.makes.map((m) => (
              <IntentLink key={m.href} href={m.href}
                className="group flex items-center gap-2.5 rounded-xl border border-card-border bg-card px-3 py-2.5 hover:border-primary hover:shadow-sm transition-all min-w-0">
                <span className="hidden sm:grid place-items-center h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary text-[13px] font-bold">{m.name.slice(0, 1)}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-content truncate group-hover:text-primary">{m.name}</span>
                  {m.count > 0 && <span className="block text-[11px] text-content-tertiary leading-tight">{m.count.toLocaleString("en-US")} {m.count === 1 ? "ad" : "ads"}</span>}
                </span>
              </IntentLink>
            ))}
          </div>
        </section>
      )}

      {/* Browse by budget */}
      {primaryCat && VERTICAL.budgets.length > 0 && (
        <section className="wrap py-2">
          <p className="mb-2 text-xs font-semibold text-content-secondary flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5 text-primary" /> {VERTICAL.noun.Many} by budget
          </p>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1 pb-1">
            {VERTICAL.budgets.map((max, i) => {
              const min = i > 0 ? VERTICAL.budgets[i - 1] : 0;
              const label = (n: number) => priceInWords(n) || `Rs ${n.toLocaleString("en-US")}`;
              const q = new URLSearchParams({ categoryId: String(primaryCat._id), maxPrice: String(max), ...(min ? { minPrice: String(min) } : {}), ...(city ? { city: city.name } : {}) });
              return (
                <Link key={max} href={`/ads?${q}`} prefetch={false}
                  className="shrink-0 rounded-full border border-card-border bg-surface px-3.5 py-1.5 text-xs font-medium text-content-secondary hover:border-primary hover:text-primary transition-colors">
                  {min ? `${label(min)} – ${label(max)}` : `Under ${label(max)}`}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Main feed */}
      <section className="wrap py-4">
        <SectionHead title={d.local ? "Ads near you" : "Latest ads"} href={cityHref} />
        {d.local && (
          <p className="-mt-2 mb-3 flex items-center gap-1.5 text-xs text-content-tertiary">
            <Navigation className="h-3.5 w-3.5 text-primary" />
            {city!.name} · closest to {fromWhere} first
          </p>
        )}
        {d.nearYou.length > 0 ? (
          <Grid ads={d.nearYou} />
        ) : d.nearbyCities.length === 0 ? (
          <div className="rounded-lg sm:rounded-xl border border-dashed border-card-border bg-surface-secondary p-10 text-center">
            <EmptyIcon className="h-10 w-10 text-content-tertiary mx-auto mb-3" />
            <h3 className="font-bold text-content">No listings yet</h3>
            <p className="text-sm text-content-secondary mt-1">Be the first to post an ad{city ? ` in ${city.name}` : ""}.</p>
            <Link href="/ads/post" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-sm px-6 py-3 shadow-md active:scale-95 transition-all">{VERTICAL.copy.sellCta}</Link>
          </div>
        ) : (
          <p className="rounded-lg border border-card-border bg-surface-secondary px-4 py-3 text-sm text-content-secondary">
            No ads in {city!.name} yet — here are the closest ones from nearby cities.
          </p>
        )}
      </section>

      {/* Category rails (only where the city has depth) */}
      {d.rails.map((r) => r.ads.length > 0 && (
        <section key={r.href} className="wrap py-4">
          <SectionHead title={r.title} href={r.href} />
          <Grid ads={r.ads} />
        </section>
      ))}

      {/* Thin city → widen by distance */}
      {d.nearbyCities.length > 0 && (
        <section className="wrap py-4">
          <SectionHead title="From nearby cities" href={`/${VERTICAL.primaryTop}`} />
          <p className="-mt-2 mb-3 text-xs text-content-tertiary">Closest first from {city!.name}</p>
          <Grid ads={d.nearbyCities} />
        </section>
      )}

      {/* Trust strip */}
      <section className="wrap py-3">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-secondary border border-card-border p-3 text-center">
          {VERTICAL.trust.map((f) => {
            const Icon = iconFor(f.icon);
            return (
              <div key={f.title} className="flex flex-col items-center gap-1">
                <Icon className="h-5 w-5 text-primary" />
                <p className="text-[11px] sm:text-sm font-bold text-content leading-none">{f.title}</p>
                <p className="text-[10px] sm:text-xs text-content-tertiary">{f.sub}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Other cities — these switch the visitor's location (plain links: the
          switch route sets a cookie and must never be prefetched). */}
      {d.cities.length > 0 && (
        <section className="wrap py-3">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            <span className="text-xs font-semibold text-content-secondary shrink-0 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {d.local ? "Other cities:" : "Cities:"}
            </span>
            {d.cities.map((c: any) => (
              <a
                key={c.slug}
                href={withBasePath(`/go/location?city=${c.slug}&next=/`)}
                className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  c.slug === city?.slug
                    ? "border-primary bg-primary/8 text-primary"
                    : "border-card-border bg-surface text-content-secondary hover:border-primary hover:text-primary"
                }`}
              >
                {c.name}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Admin feature rails */}
      {sections.map((sec: any) => (
        sec.listings?.length ? (
          <section key={sec._id} className="wrap py-4">
            <SectionHead title={sec.title} href={cityHref} />
            <Grid ads={sec.listings} />
          </section>
        ) : null
      ))}
    </div>
  );
}

function SectionHead({ title, href, accent }: { title: string; href: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className={`text-[15px] sm:text-[17px] font-bold ${accent ? "text-primary" : "text-content"}`}>{title}</h2>
      <IntentLink href={href} className="text-xs sm:text-sm font-medium text-content-secondary hover:text-primary flex items-center gap-1">
        View all <ArrowRight className="h-3.5 w-3.5" />
      </IntentLink>
    </div>
  );
}

function Grid({ ads, priorityCount = 0 }: { ads: any[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
      {ads.map((ad, i) => <ListingCard key={ad._id} ad={ad} priority={i < priorityCount} />)}
    </div>
  );
}
