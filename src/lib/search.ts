/**
 * Marketplace search — query understanding + relevance ranking.
 *
 * Unlike the old search (a regex inside the visitor's city page), a search
 * runs across the whole country and is RANKED:
 *   - relevance ("Best match"): words in the title, the brand/model category
 *     the ad sits in, its specs, then the description; a boost for the exact
 *     phrase, for fresh ads, for boosted ads and — when we know where the
 *     visitor is — for ads near them;
 *   - or nearest / newest / price, as the visitor chooses.
 *
 * The query is understood before it's run:
 *   "corolla lahore"   → text "corolla" + location Lahore
 *   "cd70 2022"        → "cd 70 2022"
 *   "honda civic" (a model we list) → straight to that model's archive
 *
 * Everything category/location related is resolved from the cached catalog,
 * so understanding a query costs no database round trip.
 */
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { getCatalog, type Catalog, type CatalogCategory, type CatalogCity, type CatalogArea } from "@/lib/catalog";
import { toCard, CARD_SELECT, CARD_SELLER_SELECT, type CardAd } from "@/lib/listing-card";
import { nearestListings, kmBetween, MAX_OFFSET } from "@/lib/geo-feed";
import { getScopeCounts } from "@/lib/scope-counts";
import { TtlLru } from "@/lib/memo";
import { oid } from "@/lib/visitor-location";
import { normalizeText } from "@/lib/keywords";
import { VERTICAL } from "@/vertical";

// ───────────────────────── normalisation ─────────────────────────

/** Same normaliser the stored `kw` keywords use — query and index must agree. */
export const normalize = normalizeText;
export const tokensOf = (s: string) => normalize(s).split(" ").filter(Boolean).slice(0, 8);

// Everyday words for whole categories and product lines (per vertical;
// unknown paths are ignored).
const ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(VERTICAL.searchAliases).map(([k, v]) => [normalize(k), v]),
);

// ───────────────────────── catalog index ─────────────────────────

type CatEntry = {
  cat: CatalogCategory; norm: string; short: string; words: string[]; depth: number;
  brand?: string; top: string; topSeq: number;
};
type PlaceEntry = { norm: string; city: CatalogCity; area?: CatalogArea };

const indexes = new WeakMap<Catalog, { cats: CatEntry[]; places: PlaceEntry[]; vocab: string[] }>();

function indexFor(catalog: Catalog) {
  const hit = indexes.get(catalog);
  if (hit) return hit;
  const byId = (id?: string | null) => (id ? catalog.categoryById(id) : undefined);
  const cats: CatEntry[] = catalog.categories.map((c) => {
    const depth = c.path.split("/").length;
    const parent = byId(c.parentCategoryId);
    const topSlug = c.path.split("/")[0];
    const top = catalog.categoryByPath(topSlug);
    const norm = normalize(c.name);
    // "Apple iPhone 15" is also known as "iPhone 15"
    const brandNorm = depth >= 3 && parent ? normalize(parent.name) : "";
    const short = brandNorm && norm.startsWith(brandNorm + " ") ? norm.slice(brandNorm.length + 1) : norm;
    return {
      cat: c, norm, short, words: Array.from(new Set([...norm.split(" "), ...short.split(" ")])), depth,
      brand: depth >= 3 ? parent?.name : depth === 2 ? c.name : undefined,
      top: top?.name || "", topSeq: Number(top?.sequence ?? 99),
    };
  });
  const places: PlaceEntry[] = [];
  for (const city of catalog.cities) {
    places.push({ norm: normalize(city.name), city });
    for (const area of catalog.areasOf(city.slug)) places.push({ norm: normalize(area.name), city, area });
  }
  const vocab = Array.from(new Set([
    ...cats.flatMap((e) => e.words),
    ...places.flatMap((p) => p.norm.split(" ")),
    ...Object.keys(ALIASES),
  ])).filter((w) => w.length >= 3);
  const idx = { cats, places, vocab };
  indexes.set(catalog, idx);
  return idx;
}

/** Live ad count per category (approved ads) — from the shared scope counts. */
let countsView: { at: number; rec: Record<string, number> } | null = null;
export async function categoryCounts(): Promise<Record<string, number>> {
  const s = await getScopeCounts();
  if (countsView?.at !== s.at) countsView = { at: s.at, rec: Object.fromEntries(s.cat) };
  return countsView.rec;
}

// ───────────────────────── query understanding ─────────────────────────

export type ParsedQuery = {
  raw: string;
  tokens: string[];           // text tokens (location words removed)
  city?: CatalogCity;         // location named in the query
  area?: CatalogArea;
  exact?: CatalogCategory;    // the whole text names one of our categories
};

export async function parseQuery(raw: string, opts: { visitorCitySlug?: string | null; counts?: Record<string, number> } = {}): Promise<ParsedQuery> {
  const catalog = await getCatalog();
  const { cats, places } = indexFor(catalog);
  let tokens = tokensOf(raw);
  let city: CatalogCity | undefined;
  let area: CatalogArea | undefined;

  // Location words — longest n-gram first ("dera ghazi khan", "dha phase 5").
  // Only when something else is left to search for: "lahore" alone is a place,
  // but the old behaviour (browse Lahore) is what that person wants anyway.
  const takeRun = (match: (s: string) => PlaceEntry | undefined) => {
    for (let n = Math.min(3, tokens.length); n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const hit = match(tokens.slice(i, i + n).join(" "));
        if (hit) { tokens = [...tokens.slice(0, i), ...tokens.slice(i + n)]; return hit; }
      }
    }
  };
  const cityHit = takeRun((s) => places.find((p) => !p.area && p.norm === s));
  if (cityHit) city = cityHit.city;
  const areaScope = city?.slug || opts.visitorCitySlug || null;
  const areaHit = takeRun((s) => {
    const all = places.filter((p) => p.area && p.norm === s);
    if (!all.length) return undefined;
    // An area name in the query counts only if it's unambiguous or in the city in play.
    const scoped = areaScope ? all.find((p) => p.city.slug === areaScope) : undefined;
    return scoped || (all.length === 1 ? all[0] : undefined);
  });
  if (areaHit) { area = areaHit.area; city = areaHit.city; }

  // Whole remaining text = one of our categories?
  const text = tokens.join(" ");
  let exact: CatalogCategory | undefined;
  if (text) {
    const alias = ALIASES[text];
    if (alias) exact = catalog.categoryByPath(alias);
    if (!exact) {
      const counts = opts.counts || (await categoryCounts());
      const matches = cats.filter((e) => e.norm === text || e.short === text);
      matches.sort((a, b) =>
        (counts[String(b.cat._id)] || 0) - (counts[String(a.cat._id)] || 0) || a.depth - b.depth || a.topSeq - b.topSeq);
      exact = matches[0]?.cat;
    }
  }
  return { raw, tokens, city, area, exact };
}

// ───────────────────────── keyword vocabulary ─────────────────────────

/**
 * Every keyword in use, sorted — so a partial word ("sams", "128") expands to
 * the whole words stored in `kw` ("samsung", "128gb") and stays an index
 * lookup. Read from the kw index in the background every 10 minutes.
 */
let vocabCache: { words: string[]; at: number } | null = null;
let vocabLoading: Promise<void> | null = null;
const VOCAB_TTL_MS = 10 * 60_000;

async function keywordVocab(): Promise<string[]> {
  if ((!vocabCache || Date.now() - vocabCache.at > VOCAB_TTL_MS) && !vocabLoading) {
    vocabLoading = (async () => {
      await dbConnect();
      const [catalog, stored] = await Promise.all([
        getCatalog(),
        Listing.distinct("kw").maxTimeMS(20_000).exec().catch(() => [] as unknown[]),
      ]);
      const words = new Set<string>([...stored.map(String), ...indexFor(catalog).vocab]);
      vocabCache = { words: Array.from(words).sort(), at: Date.now() };
    })()
      .catch((e) => console.error("[search] vocabulary refresh failed:", e?.message))
      .finally(() => { vocabLoading = null; });
  }
  if (!vocabCache) await vocabLoading;
  return vocabCache?.words || [];
}

function lowerBound(arr: string[], t: string) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < t) lo = mid + 1; else hi = mid; }
  return lo;
}

/** The stored keywords a typed word stands for: itself, its singular, and whole words it starts. */
function expandToken(t: string, vocab: string[]): string[] {
  const out = new Set<string>([t]);
  if (t.length > 3 && t.endsWith("s")) out.add(t.slice(0, -1));
  const numeric = /^\d+$/.test(t);
  if (t.length >= 2 || numeric) {
    for (let i = lowerBound(vocab, t); i < vocab.length && vocab[i].startsWith(t) && out.size < 40; i++) {
      const w = vocab[i];
      // "128" → "128gb", but not "1280"; "5" → "5g", not "512gb".
      if (numeric && /\d/.test(w[t.length] || "")) continue;
      out.add(w);
    }
  }
  return Array.from(out);
}

/** Index filter for "ads containing all these words" (the same one search uses). */
export async function keywordMatch(tokens: string[]): Promise<Record<string, unknown>> {
  if (!tokens.length) return {};
  const vocab = await keywordVocab();
  return { $and: tokens.map((t) => { const ts = expandToken(t, vocab); return { kw: ts.length === 1 ? ts[0] : { $in: ts } }; }) };
}

// ───────────────────────── ranking ─────────────────────────

export type SearchSort = "relevance" | "nearest" | "newest" | "price_low" | "price_high";
export const SEARCH_SORTS: { id: SearchSort; label: string }[] = [
  { id: "relevance", label: "Best match" },
  { id: "newest", label: "Newest" },
  { id: "nearest", label: "Nearest" },
  { id: "price_low", label: "Price: low to high" },
  { id: "price_high", label: "Price: high to low" },
];

export type SearchResult = {
  items: (CardAd & { distanceKm: number | null })[];
  total: number;
  /** `total` is a lower bound ("10,000+"): counting further isn't worth the time. */
  totalCapped: boolean;
  categories: { id: string; n: number }[];
  /** Category counts cover every match (otherwise they're from the newest matches only). */
  categoriesExact: boolean;
};

/**
 * How search stays fast at millions of ads (the pattern big marketplaces use):
 *   1. candidates — the newest POOL ads containing every word, straight off
 *      the {kw, status, createdAt} index (tens of ms, whatever the table size);
 *   2. ranking — relevance, distance and price are worked out in code on
 *      those candidates; when a query matches more than POOL ads, newest /
 *      nearest / price pages come from the indexes directly instead;
 *   3. caching — candidates live 60 s in memory, so the next person searching
 *      "iphone 13" and every infinite-scroll page reuse them.
 */
const POOL = 1000;
const TOTAL_CAP = 10_000;
type PoolDoc = {
  _id: unknown; name: string; allCategoryIds?: string[]; createdAt: Date; price?: number | null;
  isFeatured?: boolean; featuredExpiresAt?: Date | null; location?: { coordinates?: [number, number] };
};
const pools = new TtlLru<{ docs: PoolDoc[]; complete: boolean }>(150, 60_000);
const totals = new TtlLru<number>(500, 60_000);

const catWordCache = new WeakMap<Catalog, Map<string, string[]>>();
function catWordsOf(catalog: Catalog) {
  let m = catWordCache.get(catalog);
  if (!m) {
    m = new Map(indexFor(catalog).cats.map((e) => [String(e.cat._id), e.words]));
    catWordCache.set(catalog, m);
  }
  return m;
}
const pointOf = (d: PoolDoc): [number, number] | null => {
  const p = d.location?.coordinates;
  return Array.isArray(p) && (p[0] || p[1]) ? [p[0], p[1]] : null;
};

type SearchOptions = {
  tokens: string[];
  point?: [number, number] | null;
  cityId?: string; areaId?: string; categoryId?: string; condition?: string;
  sort: SearchSort; page: number; pageSize: number;
  /** Skip the (cached) total — infinite-scroll pages don't show it. */
  withTotal?: boolean;
};

// Whole result pages, shared for 10 s: the same popular query from the same
// place (area/city centre for most visitors) is answered from memory.
const resultPages = new TtlLru<SearchResult>(500, 10_000);

export function searchListings(o: SearchOptions): Promise<SearchResult> {
  return resultPages.memo(JSON.stringify(o), () => runSearch(o));
}

async function runSearch(o: SearchOptions): Promise<SearchResult> {
  await dbConnect();
  const [catalog, vocab] = await Promise.all([getCatalog(), o.tokens.length ? keywordVocab() : Promise.resolve([] as string[])]);
  const now = Date.now();
  const point = o.point || null;

  // ── Filter: every word must be one of the ad's keywords ──
  const terms = o.tokens.map((t) => expandToken(t, vocab));
  const base: Record<string, any> = { status: "approved" };
  if (terms.length) base.$and = terms.map((ts) => ({ kw: ts.length === 1 ? ts[0] : { $in: ts } }));
  if (o.areaId) base["locationRefs.areaId"] = oid(o.areaId);
  else if (o.cityId) base["locationRefs.cityId"] = oid(o.cityId);
  if (o.condition) base.condition = o.condition;
  const cat = o.categoryId ? String(o.categoryId) : null;
  const withCat = cat ? { ...base, allCategoryIds: cat } : base;

  // ── 1. Candidates (cached) ──
  const pool = await pools.memo(JSON.stringify(base), async () => {
    const docs = await Listing.find(base)
      .select("name allCategoryIds createdAt price isFeatured featuredExpiresAt location")
      .sort({ createdAt: -1 })
      .limit(POOL + 1)
      .maxTimeMS(5000)
      .lean<PoolDoc[]>();
    return { docs: docs.slice(0, POOL), complete: docs.length <= POOL };
  });
  const inCat = cat ? pool.docs.filter((d) => d.allCategoryIds?.includes(cat)) : pool.docs;

  const facet = new Map<string, number>();
  for (const d of pool.docs) for (const id of d.allCategoryIds || []) facet.set(id, (facet.get(id) || 0) + 1);

  // ── 2. This page, in the chosen order ──
  const skip = Math.min((Math.max(1, o.page) - 1) * o.pageSize, MAX_OFFSET);
  const kmOf = (d: PoolDoc) => { const p = pointOf(d); return point && p ? kmBetween(point, p) : null; };
  const priceSort = o.sort === "price_low" || o.sort === "price_high";
  let pageDocs: PoolDoc[] | null = null;
  let direct: Promise<(CardAd & { distanceKm: number | null })[]> | null = null;

  if (o.sort === "relevance" && o.tokens.length) {
    const score = scorer(o.tokens, terms, catWordsOf(catalog), point, now);
    pageDocs = inCat
      .map((d) => ({ d, s: score(d) }))
      .sort((a, b) => b.s - a.s || +new Date(b.d.createdAt) - +new Date(a.d.createdAt))
      .slice(skip, skip + o.pageSize)
      .map((x) => x.d);
  } else if (pool.complete || (o.sort === "newest" && !cat && skip + o.pageSize <= pool.docs.length)) {
    // Every match is in hand (or the newest page is): order in code.
    let list = inCat;
    if (o.sort === "nearest" && point) {
      list = inCat.map((d) => ({ d, km: kmOf(d) ?? Infinity })).sort((a, b) => a.km - b.km).map((x) => x.d);
    } else if (priceSort) {
      const dir = o.sort === "price_low" ? 1 : -1;
      const priced = inCat.filter((d) => typeof d.price === "number").sort((a, b) => dir * (a.price! - b.price!));
      list = [...priced, ...inCat.filter((d) => typeof d.price !== "number")]; // "contact for price" last
    }
    pageDocs = list.slice(skip, skip + o.pageSize);
  } else if (o.sort === "nearest" && point) {
    // Many matches = dense on the map, which is exactly when $geoNear is fast.
    direct = nearestListings({ point, match: withCat, skip, limit: o.pageSize });
  } else {
    const sort: Record<string, 1 | -1> =
      o.sort === "price_low" ? { price: 1 } : o.sort === "price_high" ? { price: -1 } : { createdAt: -1 };
    direct = Listing.find(priceSort ? { ...withCat, price: { $ne: null } } : withCat)
      .select(`${CARD_SELECT} location`)
      .sort(sort)
      .skip(skip)
      .limit(o.pageSize)
      .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT })
      .maxTimeMS(8000)
      .lean()
      .then((docs: any[]) => docs.map((d) => ({ ...toCard(d), distanceKm: kmOf(d) })));
  }

  // ── 3. Cards for the page + the total, together ──
  const [items, total] = await Promise.all([
    direct ?? cardsFor(pageDocs || [], kmOf),
    pool.complete ? inCat.length
      : o.withTotal === false ? 0
      : totals.memo(JSON.stringify(withCat), () =>
          Listing.countDocuments(withCat).limit(TOTAL_CAP).maxTimeMS(3000).exec().catch(() => inCat.length)),
  ]);

  return {
    items,
    total,
    totalCapped: !pool.complete && total >= TOTAL_CAP,
    categories: Array.from(facet, ([id, n]) => ({ id, n })),
    categoriesExact: pool.complete,
  };
}

/** Relevance: where each word matched, phrase, freshness, boost, nearness. */
function scorer(tokens: string[], terms: string[][], catWords: Map<string, string[]>, point: [number, number] | null, now: number) {
  const phrase = tokens.join(" ");
  const DAY = 864e5;
  return (d: PoolDoc) => {
    const title = normalize(d.name);
    const tw = title.split(" ");
    const cw = new Set((d.allCategoryIds || []).flatMap((id) => catWords.get(id) || []));
    let s = 0;
    tokens.forEach((t, i) => {
      const alt = terms[i];
      if (tw.includes(t)) s += 3.3;                                         // whole word in the title
      else if (tw.some((w) => w.startsWith(t) || alt.includes(w))) s += 3;  // word start in the title
      else if (alt.some((w) => cw.has(w))) s += 2.5;                        // its brand / model / section
      else s += 0.8;                                                         // a spec (storage, colour…)
    });
    if (tokens.length > 1 && title.includes(phrase)) s += 4;
    s += Math.max(0, 1.5 * (1 - (now - +new Date(d.createdAt)) / (60 * DAY)));
    if (d.isFeatured && (!d.featuredExpiresAt || +new Date(d.featuredExpiresAt) > now)) s += 0.75;
    const p = pointOf(d);
    if (point && p) s += Math.max(0, 1.5 * (1 - kmBetween(point, p) / 150));
    return s;
  };
}

/** Full cards for candidate ads, in the given order. */
async function cardsFor(docs: PoolDoc[], kmOf: (d: PoolDoc) => number | null) {
  if (!docs.length) return [];
  const full: any[] = await Listing.find({ _id: { $in: docs.map((d) => d._id as any) } })
    .select(CARD_SELECT)
    .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT })
    .maxTimeMS(5000)
    .lean();
  const byId = new Map(full.map((f) => [String(f._id), f]));
  const out: (CardAd & { distanceKm: number | null })[] = [];
  for (const d of docs) {
    const f = byId.get(String(d._id));
    if (f) out.push({ ...toCard(f), distanceKm: kmOf(d) });
  }
  return out;
}

// ───────────────────────── suggestions ─────────────────────────

export type CategorySuggestion = { id: string; name: string; path: string; context: string; n: number; depth: number };

/** Categories (brands, models, sections) matching what's typed so far. */
export async function suggestCategories(raw: string, limit = 6): Promise<CategorySuggestion[]> {
  const catalog = await getCatalog();
  const { cats } = indexFor(catalog);
  const counts = await categoryCounts();
  const q = normalize(raw);
  const toks = q.split(" ").filter(Boolean);
  if (!toks.length) return [];
  const scored = cats
    .map((e) => {
      let s = 0;
      if (e.norm === q || e.short === q) s = 100;
      else if (e.norm.startsWith(q) || e.short.startsWith(q)) s = 80;
      else if (toks.every((t) => e.words.some((w) => w.startsWith(t)))) s = 55;
      if (!s) return null;
      const n = counts[String(e.cat._id)] || 0;
      return { e, n, s: s + Math.log2(n + 1) * 4 - e.depth * 0.5 };
    })
    .filter((x): x is { e: CatEntry; n: number; s: number } => !!x)
    .sort((a, b) => b.s - a.s || a.e.topSeq - b.e.topSeq)
    .slice(0, limit);
  return scored.map(({ e, n }) => ({
    id: String(e.cat._id), name: e.cat.name, path: e.cat.path, n, depth: e.depth,
    context: e.depth === 1 ? "Category" : e.depth === 2 ? `Brand · ${e.top}` : `Model · ${e.brand || e.top}`,
  }));
}

/** Popular sections for an empty search box. */
export async function popularCategories(limit = 8): Promise<CategorySuggestion[]> {
  const catalog = await getCatalog();
  const { cats } = indexFor(catalog);
  const counts = await categoryCounts();
  return cats
    .filter((e) => e.depth <= 2 && (counts[String(e.cat._id)] || 0) > 0)
    .sort((a, b) => (counts[String(b.cat._id)] || 0) - (counts[String(a.cat._id)] || 0))
    .slice(0, limit)
    .map((e) => ({
      id: String(e.cat._id), name: e.cat.name, path: e.cat.path, n: counts[String(e.cat._id)] || 0, depth: e.depth,
      context: e.depth === 1 ? "Category" : `Brand · ${e.top}`,
    }));
}

// ───────────────────────── "did you mean" ─────────────────────────

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Spelling fix from our own vocabulary (brands, models, places): "samsng" → "samsung". */
export async function didYouMean(raw: string): Promise<string | null> {
  const catalog = await getCatalog();
  const { vocab } = indexFor(catalog);
  const toks = tokensOf(raw);
  let changed = false;
  const fixed = toks.map((t) => {
    if (t.length < 4 || /\d/.test(t) || vocab.some((w) => w.startsWith(t))) return t;
    let best = t, bestD = t.length <= 5 ? 1 : 2;
    for (const w of vocab) {
      const d = lev(t, w);
      if (d <= bestD && (d < bestD || best === t)) { best = w; bestD = d; }
    }
    if (best !== t) changed = true;
    return best;
  });
  return changed ? fixed.join(" ") : null;
}
