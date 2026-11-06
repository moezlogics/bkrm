/**
 * Cached catalog: cities, areas and categories.
 *
 * These change only when an admin edits them (or a seller's post creates a
 * new brand/model category), yet almost every request needs them — the
 * visitor's location, the header, every archive URL resolution. Reading them
 * from Mongo each time cost several sequential round trips per page; on a
 * remote production database that alone is 50-150 ms before any listing is
 * fetched. Here they're one cached object, and lookups are in-memory.
 *
 * Writers must call `expireTag("categories" | "locations")` so the next
 * request sees the change immediately.
 */
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";
import Area from "@/models/Area";
import Category from "@/models/Category";

export type CatalogCity = {
  _id: string; name: string; slug: string; order?: number;
  latitude?: number | null; longitude?: number | null; content?: string | null; [k: string]: any;
};
export type CatalogArea = {
  _id: string; name: string; slug: string; citySlug: string; cityId: string;
  latitude?: number | null; longitude?: number | null; content?: string | null; [k: string]: any;
};
export type CatalogCategory = {
  _id: string; name: string; slug: string; path: string; parentCategoryId: string | null;
  icon?: string | null; sequence?: number; [k: string]: any;
};

type Raw = { cities: CatalogCity[]; areas: CatalogArea[]; categories: CatalogCategory[] };

const loadCatalog = unstable_cache(
  async (): Promise<Raw> => {
    await dbConnect();
    const [cities, areas, categories] = await Promise.all([
      City.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),
      Area.find({ isActive: true }).sort({ name: 1 }).lean(),
      Category.find({ status: true }).sort({ sequence: 1, name: 1 }).lean(),
    ]);
    return JSON.parse(JSON.stringify({ cities, areas, categories }));
  },
  ["catalog-v1"],
  { tags: ["locations", "categories"], revalidate: 3600 }
);

export interface Catalog {
  cities: CatalogCity[];
  areas: CatalogArea[];
  categories: CatalogCategory[];
  city(slug: string | null | undefined): CatalogCity | undefined;
  area(citySlug: string | null | undefined, slug: string | null | undefined): CatalogArea | undefined;
  areaById(id: string): CatalogArea | undefined;
  areasOf(citySlug: string): CatalogArea[];
  categoryByPath(path: string): CatalogCategory | undefined;
  categoryById(id: string): CatalogCategory | undefined;
  childrenOf(parentId: string | null): CatalogCategory[];
  topCategories(): CatalogCategory[];
}

/**
 * A tiny value that changes whenever the catalog's tags expire. unstable_cache
 * hands back a freshly JSON-parsed copy on every read, so reading the ~100 KB
 * catalog itself on each call cost ~1 ms apiece, several times per request.
 * Instead, each request checks this token (a few bytes) and the full catalog is
 * re-read — and its indexes rebuilt — only when the token moves. Being in the
 * same cache as the catalog, it expires across all server instances together.
 */
const catalogVersion = unstable_cache(async () => `${Date.now()}`, ["catalog-version-v1"], {
  tags: ["locations", "categories"],
  revalidate: 3600,
});

// Shared read-only across requests: callers must copy before sorting/mutating.
let memo: { version: string; cat: Catalog } | null = null;

export const getCatalog = cache(async (): Promise<Catalog> => {
  const version = await catalogVersion();
  if (memo && memo.version === version) return memo.cat;
  const cat = buildCatalog(await loadCatalog());
  memo = { version, cat };
  return cat;
});

function buildCatalog(raw: Raw): Catalog {
  const citiesBySlug = new Map(raw.cities.map((c) => [c.slug, c]));
  const areasByKey = new Map(raw.areas.map((a) => [`${a.citySlug}/${a.slug}`, a]));
  const areasById = new Map(raw.areas.map((a) => [String(a._id), a]));
  const catsByPath = new Map(raw.categories.map((c) => [c.path, c]));
  const catsById = new Map(raw.categories.map((c) => [String(c._id), c]));
  const children = new Map<string, CatalogCategory[]>();
  for (const c of raw.categories) {
    const key = c.parentCategoryId ? String(c.parentCategoryId) : "root";
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(c);
  }

  const cat: Catalog = {
    cities: raw.cities,
    areas: raw.areas,
    categories: raw.categories,
    city: (slug) => (slug ? citiesBySlug.get(slug.toLowerCase()) : undefined),
    area: (citySlug, slug) => (citySlug && slug ? areasByKey.get(`${citySlug.toLowerCase()}/${slug.toLowerCase()}`) : undefined),
    areaById: (id) => areasById.get(String(id)),
    areasOf: (citySlug) => raw.areas.filter((a) => a.citySlug === citySlug),
    categoryByPath: (path) => catsByPath.get(path.toLowerCase()),
    categoryById: (id) => catsById.get(String(id)),
    childrenOf: (parentId) => children.get(parentId ? String(parentId) : "root") || [],
    topCategories: () => children.get("root") || [],
  };
  return cat;
}

/**
 * Invalidate a cache tag so the very next request is fresh. (`"max"` would
 * serve stale data once — not acceptable when a seller's new model page must
 * exist the moment their ad goes live, or an admin expects to see an edit.)
 */
export function expireTag(tag: "categories" | "locations" | "cms" | "settings") {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (e) {
    // Outside a request (scripts/tests) there's no cache to invalidate.
    console.warn(`expireTag(${tag}) skipped:`, (e as Error).message);
  }
}
