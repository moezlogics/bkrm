/**
 * Nearest-first listing feeds (server-only).
 *
 * Ordering by real distance lets cards say "2.3 km away", and a thin area
 * naturally widens into the next closest areas and cities — never an empty
 * page, never random ads from the other end of the country first.
 *
 * SCALE RULES (measured on 300k ads):
 *   - Nothing may sit between $geoNear and $limit. $geoNear walks the
 *     2dsphere index outward and stops after `limit` docs (7 ms); a $sort in
 *     between makes it return EVERY matching ad first (6.4 s for one city).
 *     So "boosted first" = a small boosted-only query + the plain nearest
 *     feed, merged; other orders use an index-backed find + distance in code.
 *   - $geoNear is only fast when matches are DENSE. For a rare model it walks
 *     the whole country checking the filter (a word nobody used: 10.5 s).
 *     When the caller knows the scope is small (`sizeHint`), all its ads are
 *     read through the normal indexes and sorted by distance in code instead.
 *
 * NOTE: aggregation stages bypass Mongoose casting, so every id inside `match`
 * must already be an ObjectId (see `oid`). `allCategoryIds` is stored as
 * strings and must stay strings.
 */
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { toCard, CARD_SELECT, CARD_SELLER_SELECT, type CardAd } from "@/lib/listing-card";
import { TtlLru } from "@/lib/memo";

const fieldsOf = (sel: string) => Object.fromEntries(sel.split(/\s+/).filter(Boolean).map((k) => [k, 1]));
const CARD_PROJECT = { ...fieldsOf(CARD_SELECT), dist: 1 };
const SELLER_PROJECT = fieldsOf(CARD_SELLER_SELECT);

/** Deepest page offset served (OLX-style page cap; deep offsets get slower). */
export const MAX_OFFSET = 2400;
/** Scopes up to this size are distance-sorted in code (see SCALE RULES). */
export const SMALL_SCOPE = 1500;
const FEATURED_SLOTS = 4;

export interface GeoFeedOptions {
  point: [number, number];
  match?: Record<string, unknown>;
  limit?: number;
  skip?: number;
  /** Up to 4 boosted ads (nearest first) lead page 1. */
  featuredFirst?: boolean;
  /** Any other order (newest, price…). Cards still show their distance. */
  sort?: Record<string, 1 | -1>;
  /** Only ads within this many km. */
  maxKm?: number;
  /** How many ads the match has, if known (e.g. from scope counts). */
  sizeHint?: number;
}

export type GeoCard = CardAd & { distanceKm: number | null };

const RAD = Math.PI / 180;
export function kmBetween(a: [number, number], b: [number, number]) {
  const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const coordsOf = (d: any): [number, number] | null => {
  const p = d?.location?.coordinates;
  return Array.isArray(p) && (p[0] || p[1]) ? [p[0], p[1]] : null;
};
const isBoosted = (d: any, now: number) => !!d.isFeatured && (!d.featuredExpiresAt || new Date(d.featuredExpiresAt).getTime() > now);

async function geo(o: GeoFeedOptions): Promise<GeoCard[]> {
  const geoNear: Record<string, unknown> = {
    near: { type: "Point", coordinates: o.point },
    distanceField: "dist",
    spherical: true,
    query: { status: "approved", ...(o.match || {}) },
  };
  if (o.maxKm) geoNear.maxDistance = o.maxKm * 1000;
  const pipeline: any[] = [{ $geoNear: geoNear }];
  if (o.skip) pipeline.push({ $skip: Math.min(o.skip, MAX_OFFSET) });
  pipeline.push(
    { $limit: o.limit ?? 18 },
    { $project: CARD_PROJECT },
    // Only what the card shows about the seller (verified seal, shop).
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "seller", pipeline: [{ $project: SELLER_PROJECT }] } },
    // $arrayElemAt rather than $first so this runs on MongoDB < 4.4 too.
    { $addFields: { userId: { $ifNull: [{ $arrayElemAt: ["$seller", 0] }, { verificationLevel: 0 }] } } },
    { $project: { seller: 0 } },
  );
  const docs = await Listing.aggregate(pipeline).option({ maxTimeMS: 8000 });
  return docs.map((d: any) => ({ ...toCard(d), distanceKm: typeof d.dist === "number" ? d.dist / 1000 : null }));
}

/** Index-ordered feed (newest, price…) with each card's distance from `point`. */
async function sortedWithDistance(o: GeoFeedOptions): Promise<GeoCard[]> {
  const docs: any[] = await Listing.find({ status: "approved", ...(o.match || {}) })
    .select(`${CARD_SELECT} location`)
    .sort(o.sort!)
    .skip(Math.min(o.skip || 0, MAX_OFFSET))
    .limit(o.limit ?? 18)
    .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT })
    .maxTimeMS(8000)
    .lean();
  return docs.map((d) => {
    const p = coordsOf(d);
    return { ...toCard(d), distanceKm: p ? kmBetween(o.point, p) : null };
  });
}

// Small scopes: every ad in the scope, read once through the normal indexes
// and kept briefly so infinite scroll pages don't re-read it.
const pools = new TtlLru<any[]>(64, 30_000);
async function nearestFromPool(o: GeoFeedOptions): Promise<GeoCard[]> {
  const match: Record<string, any> = { status: "approved", ...(o.match || {}) };
  const docs = await pools.memo(JSON.stringify(match), () =>
    Listing.find(match)
      .select(`${CARD_SELECT} location featuredExpiresAt`)
      .sort({ createdAt: -1 })
      .limit(SMALL_SCOPE)
      .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT })
      .maxTimeMS(8000)
      .lean() as Promise<any[]>);
  const now = Date.now();
  let ranked = docs.map((d) => {
    const p = coordsOf(d);
    return { d, km: p ? kmBetween(o.point, p) : Infinity };
  });
  if (o.maxKm) ranked = ranked.filter((r) => r.km <= o.maxKm!);
  ranked.sort((a, b) => a.km - b.km);
  if (o.featuredFirst) {
    const top = ranked.filter((r) => isBoosted(r.d, now)).slice(0, FEATURED_SLOTS);
    const lead = new Set(top);
    ranked = [...top, ...ranked.filter((r) => !lead.has(r))];
  }
  const skip = Math.min(o.skip || 0, MAX_OFFSET);
  return ranked.slice(skip, skip + (o.limit ?? 18)).map(({ d, km }) => ({ ...toCard(d), distanceKm: Number.isFinite(km) ? km : null }));
}

/**
 * The nearest boosted ads. Boosted ads are few, so this reads them through the
 * normal {scope, isFeatured, createdAt} indexes and sorts by distance in code
 * — a boosted-only $geoNear would walk the whole map when a scope has none.
 */
export async function boostedNear(o: GeoFeedOptions, n: number): Promise<GeoCard[]> {
  const docs: any[] = await Listing.find({
    $and: [{ status: "approved", ...(o.match || {}) }, { isFeatured: true }, { $or: [{ featuredExpiresAt: null }, { featuredExpiresAt: { $gt: new Date() } }] }],
  })
    .select(`${CARD_SELECT} location`)
    .sort({ createdAt: -1 })
    .limit(60)
    .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT })
    .maxTimeMS(8000)
    .lean();
  return docs
    .map((d) => { const p = coordsOf(d); return { d, km: p ? kmBetween(o.point, p) : Infinity }; })
    .filter((r) => !o.maxKm || r.km <= o.maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, n)
    .map(({ d, km }) => ({ ...toCard(d), distanceKm: Number.isFinite(km) ? km : null }));
}

export async function nearestListings(o: GeoFeedOptions): Promise<GeoCard[]> {
  await dbConnect();
  if (o.sort) return sortedWithDistance(o);
  if (o.sizeHint != null && o.sizeHint <= SMALL_SCOPE) return nearestFromPool(o);
  const limit = o.limit ?? 18;
  // Boosted ads lead page 1 only — and the plain feed keeps its own order on
  // every page, so page 2 continues exactly where page 1's plain part ended.
  if (!o.featuredFirst || (o.skip ?? 0) > 0) return geo({ ...o, limit });

  const [top, rest] = await Promise.all([boostedNear(o, Math.min(FEATURED_SLOTS, limit)), geo({ ...o, limit })]);
  // Not trimmed back to `limit`: page 2 starts at plain item `limit`, so
  // trimming would silently skip the ads the boosted ones displaced.
  const seen = new Set(top.map((c) => String(c._id)));
  return [...top, ...rest.filter((c) => !seen.has(String(c._id)))];
}

/** Count listings matching a filter (for "N ads" labels / pagination). */
export async function countListings(match: Record<string, unknown>): Promise<number> {
  await dbConnect();
  return Listing.countDocuments({ status: "approved", ...match }).maxTimeMS(8000);
}
