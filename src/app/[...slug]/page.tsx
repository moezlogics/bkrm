import React from "react";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, MapPin, SlidersHorizontal, Navigation, X } from "lucide-react";
import { ListingCard, ListingGrid } from "@/components/ListingCard";
import { IntentLink } from "@/components/IntentLink";
import { SyncLocation } from "@/components/SyncLocation";
import { getVisitorLocation, oid } from "@/lib/visitor-location";
import { getScopeCounts } from "@/lib/scope-counts";
import {
  resolveArchive, archiveRef, archiveSort, archiveTotal, archiveListings, archiveChildren,
  archiveAreaFacet, archiveFallback, scopeTotal, ARCHIVE_PAGE_SIZE, TOTAL_CAP, ARCHIVE_DEFAULT_SORT,
  type ArchiveRef,
} from "@/lib/archive";
import { MAX_OFFSET } from "@/lib/geo-feed";
import { TtlLru } from "@/lib/memo";
import { SortSelect } from "./SortSelect";
import { JsonLd } from "@/components/JsonLd";
import { getBaseUrl, breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { InfiniteListingFeed } from "@/components/listing/InfiniteListingFeed";
import { loadMoreArchiveListingsAction } from "@/app/actions/listings";
import { VERTICAL } from "@/vertical";
import { getCatalog } from "@/lib/catalog";
import { SectionThumb } from "@/components/home/SectionThumb";
import { getSectionCovers } from "@/lib/section-covers";

/**
 * Location-first browse archives (the OLX model):
 *   /cars · /cars/toyota · /cars/toyota/<model>
 *   /lahore · /lahore/cars · /lahore/gulberg · /lahore/gulberg/cars
 * plus `?q=` search scoped to whatever place + category the page is.
 *
 * Ordering is nearest-first whenever there's a reference point — the
 * visitor's own location on pages in their city (or national pages), else the
 * centre of the area/city being browsed — and every card shows its distance.
 * The area facet lists live counts ("Gulberg (12)"). A real place + category
 * is always a real page: an empty scope widens by distance from that place,
 * labelled and noindexed. Only unknown slugs 404.
 */

// Loosely typed on purpose: catalog records carry CMS fields (content, seo…).
type Resolved = { city?: any; area?: any; category?: any } | null;

function plain<T>(d: T): T { return JSON.parse(JSON.stringify(d)); }

/** URL → place + category (cached catalog; React-cached per request). */
const resolve = cache(async (segments: string[]): Promise<Resolved> => resolveArchive(segments));

/**
 * Everything the page needs, in one parallel wave. Counts, chips and the area
 * facet come from the precomputed scope counts — at 300k ads the old
 * per-request count + distinct + group cost 0.5–1 s before a single card.
 */
// A page's data is the same for everyone with the same reference point
// (area/city centre for most visitors), so it's shared for 10 s: a popular
// archive costs one set of queries per 10 s instead of one per visitor.
/** Below this many ads a page is topped up with the nearest ones outside it. */
const NEARBY_MIN = 8;
const shared = new TtlLru<Awaited<ReturnType<typeof loadData>>>(500, 10_000);
const fetchData = cache(async function fetchData(
  r: NonNullable<Resolved>, sort: string, page: number, q: string, ref: ArchiveRef
) {
  const key = JSON.stringify([r.city?.slug, r.area?.slug, r.category?.path, sort, page, q, ref?.point, ref?.label]);
  return shared.memo(key, () => loadData(r, sort, page, q, ref));
});

async function loadData(r: NonNullable<Resolved>, sort: string, page: number, q: string, ref: ArchiveRef) {
  const counts = await getScopeCounts();
  const total = await archiveTotal(r, q, counts);
  const [listings, children, areaFacet] = await Promise.all([
    archiveListings({ r, sort, page, q, ref, total }),
    archiveChildren(r, counts),
    archiveAreaFacet(r, counts),
  ]);

  // Empty here? Widen by distance from this place instead of a dead end.
  let fallback: { label: string; listings: any[] } | null = null;
  if (total === 0 && ref) {
    const near = await archiveFallback(r, q, ref, counts);
    if (near.length) fallback = { label: ref.label, listings: near };
  }

  // Thin here (a few ads)? Top the page up with the closest ones outside it —
  // other areas of the city first on an area page, then other cities (OLX).
  let nearby: any[] = [];
  if (total > 0 && total < NEARBY_MIN && page === 1 && ref && r.city) {
    const exclude = r.area ? { "locationRefs.areaId": { $ne: oid(r.area._id) } } : { "locationRefs.cityId": { $ne: oid(r.city._id) } };
    nearby = await archiveFallback(r, q, ref, counts, exclude, NEARBY_MIN * 2 - total);
  }

  return {
    listings: plain(listings),
    nearby: plain(nearby),
    total,
    totalCapped: total >= TOTAL_CAP,
    children: plain(children),
    areaFacet,
    fallback: fallback ? plain(fallback) : null,
  };
}

function prefixFor(r: { city?: any; area?: any }) {
  if (r.area && r.city) return `/${r.city.slug}/${r.area.slug}`;
  if (r.city) return `/${r.city.slug}`;
  return "";
}
function locLabel(r: NonNullable<Resolved>) {
  if (r.area) return `${r.area.name}, ${r.city.name}`;
  if (r.city) return r.city.name;
  return "Pakistan";
}
function pageTitle(r: NonNullable<Resolved>) {
  if (r.category) return `${r.category.name} in ${locLabel(r)}`;
  if (r.area) return `${r.area.name}, ${r.city.name}`;
  return `${VERTICAL.copy.inCityLabel} in ${r.city.name}`;
}
function prettySeg(s: string) { return s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ slug: string[] }>; searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const r = await resolve(slug);
  if (!r) return { title: "Not found", robots: { index: false, follow: false } };
  const base = getBaseUrl();
  const url = `${base}/${slug.join("/")}`;
  const q = (sp.q || "").trim();
  const total = scopeTotal(await getScopeCounts(), r);
  const what = r.category ? r.category.name : VERTICAL.copy.everythingLabel;
  const where = locLabel(r);
  const title = q ? `“${q}” — ${what} in ${where}` : r.category?.seoTitle || `${what} for sale in ${where}`;
  const description = r.category?.seoDescription || `Buy & sell used and new ${what.toLowerCase()} in ${where}. ${total} listings with prices, photos and full details — contact sellers directly.`;
  return {
    title, description,
    alternates: { canonical: url }, // search variants canonicalise to the archive
    // Thin pages and search-result variants stay out of the index.
    robots: total > 0 && !q ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url, type: "website" },
  };
}

export default async function Browse({ params, searchParams }: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ sort?: string; page?: string; q?: string }>;
}) {
  const [{ slug }, sp, loc] = await Promise.all([params, searchParams, getVisitorLocation()]);
  const r = await resolve(slug);
  if (!r) notFound();

  const q = (sp.q || "").trim().slice(0, 100);
  // Deep pages are capped (OLX does the same): offsets past ~100 pages get slow.
  const page = Math.min(Math.floor(MAX_OFFSET / ARCHIVE_PAGE_SIZE) + 1, Math.max(1, Number(sp.page) || 1));
  const ref = archiveRef(r, loc);
  const defaultSort = ARCHIVE_DEFAULT_SORT;
  const sort = archiveSort(sp.sort, ref);

  const [{ listings, nearby, total, totalCapped, children, areaFacet, fallback }, catalog, covers] = await Promise.all([
    fetchData(r, sort, page, q, ref),
    getCatalog(),
    getSectionCovers(),
  ]);
  // A page number past the end (?page=500) is a real 404, not an empty 200
  // page — Search Console reports those as "soft 404".
  if (page > 1 && listings.length === 0) notFound();

  const topCategories = catalog.topCategories();
  const activeTopSlug = r.category ? String(r.category.path).split("/")[0] : null;

  const base = getBaseUrl();
  const prefix = prefixFor(r);
  const path = `/${slug.join("/")}`;
  const editorial = !q ? r.category?.content || (!r.category && !r.area ? r.city?.content : null) : null;

  // Breadcrumb
  const crumbs: { name: string; url: string }[] = [{ name: "Home", url: base }];
  if (r.city) crumbs.push({ name: r.city.name, url: `${base}/${r.city.slug}` });
  if (r.area) crumbs.push({ name: r.area.name, url: `${base}/${r.city.slug}/${r.area.slug}` });
  if (r.category) {
    const parts = r.category.path.split("/");
    let acc = "";
    // Real category names ("Honda CD 70"), not prettified slugs ("Honda Cd 70").
    for (const p of parts) { acc = acc ? `${acc}/${p}` : p; crumbs.push({ name: catalog.categoryByPath(acc)?.name || prettySeg(p), url: `${base}${prefix}/${acc}` }); }
  }

  // "Filters" deep-link into advanced search
  const filterParams = new URLSearchParams();
  if (r.category) filterParams.set("categoryId", r.category._id);
  if (r.city) filterParams.set("city", r.city.name);
  if (q) filterParams.set("search", q);
  const filtersHref = `/ads?${filterParams.toString()}`;

  const keepQ = q ? `?q=${encodeURIComponent(q)}` : "";

  const scopeName = r.category ? `${r.category.name}, ${locLabel(r)}` : locLabel(r);
  const nearestNote = ref && sort === "nearest" ? `closest to ${ref.label} first` : null;

  return (
      <div className="wrap pt-3 md:pt-4 pb-8">
        <JsonLd data={[breadcrumbJsonLd(crumbs), itemListJsonLd(listings.map((l: any) => `${base}/ads/${l.slug}`))]} />
        {/* Browsing another city makes it the visitor's location (OLX behaviour). */}
        {r.city && r.city.slug !== loc.city?.slug && <SyncLocation city={r.city.slug} />}

        {/* Breadcrumb */}
          <nav className="max-md:hidden flex items-center gap-1 text-[13.5px] text-content-tertiary mb-2.5 flex-wrap">
            {crumbs.map((c, i) => (
              <React.Fragment key={c.url}>
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
                {i < crumbs.length - 1 || q ? (
                  <IntentLink href={c.url.replace(base, "") || "/"} className="hover:text-primary whitespace-nowrap">{c.name}</IntentLink>
                ) : (
                  <span className="text-content-secondary whitespace-nowrap">{c.name}</span>
                )}
              </React.Fragment>
            ))}
          </nav>

          {/* Round category navigation (city & archive pages) */}
          {topCategories.length > 0 && (
            <section className="mb-3.5 sm:mb-4">
              <div className="flex gap-3 sm:gap-5 overflow-x-auto hide-scrollbar snap-x py-1 lg:justify-between">
                {topCategories.map((c: any) => {
                  const isActive = activeTopSlug === c.slug;
                  const targetHref = isActive && r.city && !String(r.category?.path || "").includes("/")
                    ? `${prefix}${keepQ}`
                    : `${prefix}/${c.path}${keepQ}`;
                  return (
                    <IntentLink key={String(c._id)} href={targetHref} className="group snap-start shrink-0 w-[72px] sm:w-[88px] flex flex-col items-center text-center gap-1.5">
                      <SectionThumb src={covers[c.slug]} icon={c.icon} sizes="96px"
                        className={`h-[64px] w-[64px] sm:h-[78px] sm:w-[78px] rounded-full transition ${isActive ? "ring-[2.5px] ring-primary shadow-md" : "ring-2 ring-white shadow-md group-hover:ring-primary"
                          }`} />
                      <span className={`text-[12.5px] sm:text-[13.5px] font-semibold leading-tight line-clamp-2 ${isActive ? "text-primary font-bold" : "text-content group-hover:text-primary"
                        }`}>{c.name}</span>
                    </IntentLink>
                  );
                })}
              </div>
            </section>
          )}

          {/* Title + sort */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 mb-3.5 sm:mb-4">
              <div className="min-w-0">
                  <h1 className="text-[20px] sm:text-[26px] font-extrabold tracking-tight text-content leading-tight">
                    {q ? `“${q}”` : pageTitle(r)}
                  </h1>
                    <p className="text-[13.5px] sm:text-sm text-content-tertiary mt-0.5 flex items-center gap-1 flex-wrap">
                      {q && <span>in {scopeName} ·</span>}
                      <span>{total > 0 ? `${total.toLocaleString("en-PK")}${totalCapped ? "+" : ""} ${total === 1 ? "ad" : "ads"}` : "No exact matches"}</span>
                      {total > 0 && nearestNote && (
                        <span className="inline-flex items-center gap-1 text-primary">· <Navigation className="h-3 w-3" />{nearestNote}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={filtersHref} className="inline-flex items-center gap-1.5 px-3.5 h-9 sm:h-10 rounded-full text-[13.5px] sm:text-[14.5px] font-bold bg-white ring-1 ring-card-border hover:ring-content-tertiary"><SlidersHorizontal className="h-4 w-4 text-primary" /> <span>Filters</span></Link>
                    <SortSelect current={sort} canNearest={!!ref} defaultSort={defaultSort} />
                  </div>
              </div>

              {/* Active search */}
              {q && (
                <div className="mb-3">
                  <Link href={path} className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft h-9 px-3.5 text-[14px] font-semibold text-primary-dark">
                    Search: {q} <X className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}

              {/* National page, visitor has a city → offer their local version */}
              {!r.city && loc.city && r.category && (
                <Link
                  href={`/${loc.city.slug}/${r.category.path}${keepQ}`}
                  className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-[14.5px]"
                >
                  <span className="text-content-secondary">
                    All of Pakistan{ref ? `, nearest to ${ref.label} first` : ""}.
                  </span>
                  <span className="shrink-0 font-semibold text-primary inline-flex items-center gap-1">
                    {r.category.name} in {loc.city.name} <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              )}

              {/* Area facet (OLX's location filter) */}
              {r.city && areaFacet.length > 0 && (
                <div className="mb-3">

                  <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
                    {r.area && (
                      <IntentLink
                        href={`/${r.city.slug}${r.category ? `/${r.category.path}` : ""}${keepQ}`}
                        className="shrink-0 inline-flex items-center h-9 rounded-full bg-white ring-1 ring-card-border px-3.5 text-[14px] font-semibold text-content-secondary hover:text-content"
                      >
                        All {r.city.name}
                      </IntentLink>
                    )}
                    {areaFacet.map((a) => {
                      const on = r.area?.slug === a.slug;
                      return (
                        <IntentLink
                          key={a.slug}
                          href={`/${r.city.slug}/${a.slug}${r.category ? `/${r.category.path}` : ""}${keepQ}`}
                          aria-current={on ? "page" : undefined}
                          className={`shrink-0 inline-flex items-center gap-1 h-9 rounded-full px-3.5 text-[14px] font-semibold transition-colors ${on ? "bg-content text-white" : "bg-white ring-1 ring-card-border text-content-secondary hover:text-content"
                            }`}
                        >
                          {a.name} <span className={on ? "text-white/80" : "text-content-tertiary"}>({a.n})</span>
                        </IntentLink>
                      );
                    })}
                  </div>
                </div>
              )}

                {/* Refine: sub-category / breed chips */ }
      {r.category && children.length > 0 && (
                <div className="mb-4">

                  <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
                    {children.map((c: any) => (
                      <IntentLink key={c._id} href={`${prefix}/${c.path}${keepQ}`} className="shrink-0 inline-flex items-center h-9 rounded-full bg-primary-soft px-3.5 text-[14px] font-semibold text-primary-dark hover:bg-primary/15">{c.name}</IntentLink>
                    ))}
                  </div>
                </div>
              )}

              {/* Listings */}
              {listings.length > 0 ? (
                <InfiniteListingFeed
                  initialListings={listings}
                  total={total}
                  onLoadMore={loadMoreArchiveListingsAction.bind(null, {
                    segments: slug,
                    sort,
                    q,
                  })}
                />
              ) : fallback ? (
                <>
                  <div className="card px-4 py-3.5 flex items-start gap-2.5">
                    <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content">
                        {q ? `No “${q}” ads` : `No ${r.category ? `${r.category.name.toLowerCase()} ` : ""}ads`} in {locLabel(r)} right now
                      </p>
                      <p className="text-xs text-content-secondary mt-0.5">Showing the closest ones to {fallback.label} instead.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4 mt-3">
                    {fallback.listings.map((ad: any, i: number) => <ListingCard key={ad._id} ad={ad} priority={i < 2} />)}
                  </div>
                </>
              ) : (
                <div className="card p-10 text-center">
                  <span className="mx-auto mb-4 grid place-items-center h-14 w-14 rounded-2xl bg-primary-soft text-primary"><MapPin className="h-6 w-6" /></span>
                  <h3 className="font-semibold text-content">
                    {q ? `No results for “${q}”` : `No ${r.category ? r.category.name.toLowerCase() : "ads"} in ${locLabel(r)} yet`}
                  </h3>
                  <p className="text-sm text-content-secondary mt-1">
                    {q ? "Try fewer or different words." : "Be the first to post one here, or browse all of Pakistan."}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                    {q ? (
                      <Link href={path} className="inline-flex items-center h-11 rounded-full bg-primary hover:bg-primary-dark text-white font-bold text-sm px-6">Clear search</Link>
                    ) : (
                      <Link href="/ads/post" className="inline-flex items-center h-11 rounded-full bg-primary hover:bg-primary-dark text-white font-bold text-sm px-6">Post an ad</Link>
                    )}
                    {r.category && r.city && (
                      <Link href={`/${r.category.path}${keepQ}`} className="inline-flex items-center h-11 rounded-full bg-white ring-1 ring-card-border font-bold text-sm px-6">
                        All Pakistan
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Thin page: the closest ads outside it */}
              {nearby.length > 0 && (
                <section className="mt-8">
                  <h2 className="text-[20px] font-extrabold tracking-tight text-content">{r.area ? `More near ${r.area.name}` : `Near ${r.city.name}`}</h2>
                  <p className="text-[14px] text-content-tertiary mt-0.5 mb-3">{r.category ? r.category.name : "Ads"} from {r.area ? "nearby areas and cities" : "the closest cities"}, nearest first</p>
                  <ListingGrid ads={nearby} />
                </section>
              )}

              {/* SEO editorial content */}
              {editorial && (
                <div className="mt-10 pt-6 border-t border-card-border">
                  <div className="prose prose-sm max-w-none text-content-secondary [&_h2]:text-content [&_h2]:font-bold [&_h2]:text-base [&_a]:text-primary" dangerouslySetInnerHTML={{ __html: editorial }} />
                </div>
              )}
            </div>
            );
}
