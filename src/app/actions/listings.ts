"use server";

import { getCatalog } from "@/lib/catalog";
import type { CardAd } from "@/lib/listing-card";
import { getVisitorLocation } from "@/lib/visitor-location";
import { parseQuery, searchListings, SEARCH_SORTS, type SearchSort } from "@/lib/search";
import { resolveArchive, archiveRef, archiveSort, archiveTotal, archiveListings } from "@/lib/archive";

const PAGE_SIZE = 24;

/**
 * Server Action: the next page of an archive (category/city hubs) for
 * infinite scroll. Same scope, reference point and order as the server-
 * rendered first page (lib/archive), so pages continue without gaps/repeats.
 */
export async function loadMoreArchiveListingsAction(
  params: {
    segments: string[];
    sort?: string;
    q?: string;
  },
  page: number = 2
): Promise<CardAd[]> {
  const { segments, sort, q = "" } = params;
  const r = await resolveArchive(segments);
  if (!r) return [];
  const ref = archiveRef(r, await getVisitorLocation());
  const query = q.trim().slice(0, 100);
  const total = await archiveTotal(r, query);
  const listings = await archiveListings({ r, sort: archiveSort(sort, ref), page: Math.min(101, Math.max(2, page)), q: query, ref, total });
  return JSON.parse(JSON.stringify(listings));
}

/**
 * Server Action: Load more listings for the /search page.
 * Returns plain CardAd objects without changing URL parameters.
 */
export async function loadMoreSearchListingsAction(
  params: {
    q?: string;
    sort?: string;
    loc?: string;
    cat?: string;
    cond?: string;
  },
  page: number = 2
): Promise<CardAd[]> {
  const { q = "", sort = "relevance", loc, cat, cond } = params;
  const [visitor, catalog] = await Promise.all([getVisitorLocation(), getCatalog()]);
  const raw = q.trim().slice(0, 100);
  const parsed = await parseQuery(raw, { visitorCitySlug: visitor.city?.slug });

  let city = parsed.city, area = parsed.area;
  // Same rule as the search page: an explicit ?loc (including "all") wins.
  if (loc) {
    const [c, a] = loc.split("/");
    city = loc === "all" ? undefined : catalog.city(c);
    area = city && a ? catalog.area(city.slug, a) : undefined;
  }

  let point: [number, number] | null = null;
  if (visitor.point && (!city || city.slug === visitor.city?.slug)) {
    point = visitor.point;
  } else {
    const p = area?.latitude != null ? area : city?.latitude != null ? city : null;
    if (p) { point = [Number(p.longitude), Number(p.latitude)]; }
  }

  const category = cat ? catalog.categoryById(cat) : undefined;
  const condition = cond === "new" || cond === "used" ? cond : undefined;
  const safeSort = (SEARCH_SORTS.some((s) => s.id === sort) ? sort : "relevance") as SearchSort;

  const res = await searchListings({
    tokens: parsed.tokens,
    point,
    sort: safeSort,
    page: Math.min(100, Math.max(1, page)),
    pageSize: PAGE_SIZE,
    withTotal: false,
    cityId: area ? undefined : city ? String(city._id) : undefined,
    areaId: area ? String(area._id) : undefined,
    categoryId: category ? String(category._id) : undefined,
    condition,
  });

  return JSON.parse(JSON.stringify(res.items));
}

