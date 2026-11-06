/**
 * Location-first browse archives (server-only), shared by the archive page
 * (first page, server-rendered) and its infinite-scroll action (every page
 * after) — one definition of scope, reference point and order, so page 2
 * always continues page 1 exactly.
 *
 * Scale: nothing here counts or groups per request. Totals, brand chips and
 * the area facet come from the precomputed scope counts (lib/scope-counts);
 * listings come from index-backed feeds (lib/geo-feed), and small scopes are
 * distance-sorted in code rather than by a sparse $geoNear walk.
 */
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { getCatalog, type CatalogCategory, type CatalogCity, type CatalogArea } from "@/lib/catalog";
import { CARD_SELECT, CARD_SELLER_SELECT, toCards, type CardAd } from "@/lib/listing-card";
import { nearestListings, MAX_OFFSET } from "@/lib/geo-feed";
import { getScopeCounts, countIn, type ScopeCounts } from "@/lib/scope-counts";
import { keywordMatch, tokensOf } from "@/lib/search";
import { oid, type VisitorLocation } from "@/lib/visitor-location";

export const ARCHIVE_PAGE_SIZE = 24;
/** Search-word totals stop counting here ("10,000+"). */
export const TOTAL_CAP = 10_000;

export const ARCHIVE_SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { isFeatured: -1, createdAt: -1 },
  price_low: { price: 1 },
  price_high: { price: -1 },
};

export type ArchiveScope = { city?: CatalogCity; area?: CatalogArea; category?: CatalogCategory };
export type ArchiveRef = { point: [number, number]; label: string; fromVisitor: boolean } | null;

/** URL → place + category, from the cached catalog (no DB round trips). */
export async function resolveArchive(segments: string[]): Promise<ArchiveScope | null> {
  const catalog = await getCatalog();
  const lower = segments.map((s) => decodeURIComponent(s).toLowerCase());
  const city = catalog.city(lower[0]);
  if (city) {
    const rest = lower.slice(1);
    if (rest.length === 0) return { city };
    const area = catalog.area(city.slug, rest[0]);
    if (area) {
      const rest2 = rest.slice(1);
      if (rest2.length === 0) return { city, area };
      const cat = catalog.categoryByPath(rest2.join("/"));
      return cat ? { city, area, category: cat } : null;
    }
    const cat = catalog.categoryByPath(rest.join("/"));
    return cat ? { city, category: cat } : null;
  }
  const cat = catalog.categoryByPath(lower.join("/"));
  return cat ? { category: cat } : null;
}

/**
 * Filter for a place + category. `agg` = for an aggregation pipeline, where
 * Mongoose doesn't cast, so ids must be real ObjectIds. `allCategoryIds`
 * (the [section, brand, model] rollup, always including the ad's own
 * category) is stored as strings in both cases.
 */
export function scopeMatch(r: ArchiveScope, agg: boolean) {
  const id = (x: unknown) => (agg ? oid(String(x)) : String(x));
  const m: Record<string, any> = {};
  if (r.area) m["locationRefs.areaId"] = id(r.area._id);
  else if (r.city) m["locationRefs.cityId"] = id(r.city._id);
  if (r.category) m.allCategoryIds = String(r.category._id);
  return m;
}

const scopeIds = (r: ArchiveScope) => ({
  cityId: r.city ? String(r.city._id) : null,
  areaId: r.area ? String(r.area._id) : null,
  catId: r.category ? String(r.category._id) : null,
});

/** Live ads in a scope, from the precomputed counts. */
export function scopeTotal(counts: ScopeCounts, r: ArchiveScope) {
  return countIn(counts, scopeIds(r));
}

const coords = (p: any): [number, number] | null =>
  p && typeof p.latitude === "number" && typeof p.longitude === "number" ? [p.longitude, p.latitude] : null;

/**
 * What "nearest" means on this page. On a national page or a page in the
 * visitor's own city it's the visitor. When they're browsing another city,
 * distance from Lahore is meaningless for Karachi ads, so we measure from the
 * area/city being browsed instead.
 */
export function archiveRef(r: ArchiveScope, loc: VisitorLocation): ArchiveRef {
  if (loc.point && (!r.city || r.city.slug === loc.city?.slug)) {
    return {
      point: loc.point,
      label: loc.precise ? "you" : loc.area?.name ?? loc.city?.name ?? "you",
      fromVisitor: true,
    };
  }
  const p = coords(r.area) || coords(r.city);
  return p ? { point: p, label: r.area?.name ?? r.city!.name, fromVisitor: false } : null;
}

/**
 * The default order: boosted ads, then newest — what OLX ("Most relevant")
 * and dubizzle open with. Distance is a choice ("Nearest first"), not the
 * default: every card already shows how far away it is, and a pure distance
 * order buried fresh ads under week-old ones from next door.
 */
export const ARCHIVE_DEFAULT_SORT = "newest";

/** The sort actually used: an unknown value or "nearest" without a point falls back. */
export function archiveSort(requested: string | undefined, ref: ArchiveRef) {
  if (requested === "nearest") return ref ? "nearest" : ARCHIVE_DEFAULT_SORT;
  return requested && ARCHIVE_SORTS[requested] ? requested : ARCHIVE_DEFAULT_SORT;
}

/**
 * How many ads the page lists: the precomputed scope count, or — with search
 * words — a capped count on the keyword index.
 */
export async function archiveTotal(r: ArchiveScope, q: string, counts?: ScopeCounts): Promise<number> {
  const tokens = q ? tokensOf(q) : [];
  if (!tokens.length) return scopeTotal(counts || (await getScopeCounts()), r);
  await dbConnect();
  const match: Record<string, any> = { status: "approved", ...scopeMatch(r, false), ...(await keywordMatch(tokens)) };
  return Listing.countDocuments(match).limit(TOTAL_CAP).maxTimeMS(3000).exec().catch(() => 0);
}

/** One page of an archive, in the page's order. */
export async function archiveListings(o: {
  r: ArchiveScope; sort: string; page: number; q: string; ref: ArchiveRef;
  /** Ads in scope (from archiveTotal) — picks the right strategy for small scopes. */
  total: number;
}): Promise<CardAd[]> {
  await dbConnect();
  const { r, sort, ref } = o;
  const tokens = o.q ? tokensOf(o.q) : [];
  const text = tokens.length ? await keywordMatch(tokens) : {};
  const skip = Math.min((Math.max(1, o.page) - 1) * ARCHIVE_PAGE_SIZE, MAX_OFFSET);
  const priced = sort === "price_low" || sort === "price_high" ? { price: { $ne: null } } : {}; // "contact for price" can't be ordered

  if (ref) {
    return nearestListings({
      point: ref.point,
      match: { ...scopeMatch(r, true), ...text, ...priced },
      skip,
      limit: ARCHIVE_PAGE_SIZE,
      sizeHint: o.total,
      // Boosted ads lead within a city; on national pages pure distance wins —
      // a paid ad 1,000 km away shouldn't sit above one down the road.
      ...(sort === "nearest" ? { featuredFirst: !!r.city } : { sort: ARCHIVE_SORTS[sort] || ARCHIVE_SORTS.newest }),
    });
  }
  const docs = await Listing.find({ status: "approved", ...scopeMatch(r, false), ...text, ...priced })
    .select(CARD_SELECT)
    .sort(ARCHIVE_SORTS[sort] || ARCHIVE_SORTS.newest)
    .skip(skip)
    .limit(ARCHIVE_PAGE_SIZE)
    .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT })
    .maxTimeMS(8000)
    .lean();
  return toCards(docs);
}

/** Brand/model chips — on a location page only the ones with stock there. */
export async function archiveChildren(r: ArchiveScope, counts: ScopeCounts) {
  const catalog = await getCatalog();
  const kids = catalog.childrenOf(r.category ? String(r.category._id) : null);
  if (!r.city) return kids;
  const { cityId, areaId } = scopeIds(r);
  return kids.filter((c) => countIn(counts, { cityId, areaId, catId: String(c._id) }) > 0);
}

/** Areas of the city with live counts for this category ("Gulberg (12)"). */
export async function archiveAreaFacet(r: ArchiveScope, counts: ScopeCounts) {
  if (!r.city) return [];
  const catalog = await getCatalog();
  const catId = r.category ? String(r.category._id) : null;
  const perArea = counts.cityAreas.get(String(r.city._id));
  return catalog.areasOf(r.city.slug)
    .map((a) => ({
      name: a.name, slug: a.slug,
      n: catId ? counts.areaCat.get(`${a._id}:${catId}`) || 0 : perArea?.get(String(a._id)) || 0,
    }))
    .filter((a) => a.n > 0)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/**
 * Empty here? The closest matching ads anywhere (for an area that's the rest
 * of its city first, then nearby cities) — never a dead end.
 */
/**
 * Nearest ads around a place, same category (and search words). `exclude`
 * leaves out the scope already shown, so a thin page can be topped up with
 * what is closest outside it.
 */
export async function archiveFallback(r: ArchiveScope, q: string, ref: NonNullable<ArchiveRef>, counts: ScopeCounts, exclude: Record<string, unknown> = {}, limit = ARCHIVE_PAGE_SIZE) {
  const tokens = q ? tokensOf(q) : [];
  const text = tokens.length ? await keywordMatch(tokens) : {};
  const wide = r.category ? { allCategoryIds: String(r.category._id) } : {};
  return nearestListings({
    point: ref.point,
    match: { ...wide, ...text, ...exclude },
    limit,
    // Without search words we know the national size; with them, assume sparse.
    sizeHint: tokens.length ? 0 : countIn(counts, { catId: r.category ? String(r.category._id) : null }),
  });
}
