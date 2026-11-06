/**
 * Resolve a city/area typed or picked by a seller — and create it when it
 * isn't in our list yet, so the next seller (and every buyer filter, archive
 * URL and "near you" feed) has it too.
 *
 * Guard rails, because these names become public URLs (/city/area/...):
 * - names are cleaned, title-cased and length-checked; contact info is refused;
 * - a slug may not shadow a category or an app route (/lahore/tablets!);
 * - at most a few new places per user per day;
 * - new places are flagged source:"user" for the admin to review/merge.
 *
 * Coordinates (needed for "nearest first"): the seller's own GPS when it is
 * plausibly in that place, else an OpenStreetMap lookup, else the city centre.
 */
import City from "@/models/City";
import Area from "@/models/Area";
import Category from "@/models/Category";
import { containsContactInfo } from "@/lib/spam";
import { expireTag } from "@/lib/catalog";
import { seg } from "@/lib/taxonomy";

const RESERVED = new Set([
  "ads", "ad", "admin", "api", "login", "signup", "newlogin", "setup", "logout", "dashboard", "chat", "search", "blog", "faq",
  "page", "pages", "shop", "shops", "category", "categories", "location", "locations", "media", "sell", "post",
  "go", "sitemap", "robots", "about", "contact", "help", "terms", "privacy", "all", "pakistan", "new", "used",
]);
const PK = { minLat: 23.5, maxLat: 37.2, minLng: 60.8, maxLng: 77.9 };
const DAILY_LIMIT = 6;

export class LocationError extends Error {}

export function cleanPlaceName(raw: unknown): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length < 2 || s.length > 40) throw new LocationError("Place names should be 2–40 characters");
  if (!/^[\p{L}\d][\p{L}\d .,'()\-/]*$/u.test(s) || !/\p{L}/u.test(s)) throw new LocationError("Please use letters and numbers only for the place name");
  const c = containsContactInfo(s);
  if (c.phone || c.url || c.email) throw new LocationError("Place names can't contain phone numbers or links");
  // Title-case words the user typed in all-lower or ALL-UPPER; keep "DHA", "G-11" etc.
  return s.split(" ").map((w) => (w === w.toLowerCase() || (w.length > 3 && w === w.toUpperCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
}

type Coords = { lat: number; lng: number } | null;
const inPk = (c: Coords) => !!c && c.lat >= PK.minLat && c.lat <= PK.maxLat && c.lng >= PK.minLng && c.lng <= PK.maxLng;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/** OpenStreetMap (Nominatim) lookup, Pakistan only. Best effort, 3 s budget. */
async function geocode(q: string): Promise<{ lat: number; lng: number; state?: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pk&addressdetails=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, {
      headers: { "User-Agent": `${process.env.NEXT_PUBLIC_APP_NAME || "Classifieds"} marketplace (location lookup)` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const [hit] = await r.json();
    if (!hit) return null;
    const c = { lat: Number(hit.lat), lng: Number(hit.lon) };
    return inPk(c) ? { ...c, state: hit.address?.state } : null;
  } catch {
    return null;
  }
}

async function slugIsFree(slug: string): Promise<boolean> {
  if (!slug || RESERVED.has(slug)) return false;
  return !(await Category.exists({ $or: [{ slug }, { path: slug }] }));
}

async function checkQuota(userId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [c, a] = await Promise.all([
    City.countDocuments({ addedBy: userId, createdAt: { $gte: since } }),
    Area.countDocuments({ addedBy: userId, createdAt: { $gte: since } }),
  ]);
  if (c + a >= DAILY_LIMIT) throw new LocationError("You've added several new places today — please pick one from the list or try tomorrow");
}

const rx = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

export async function resolveOrCreateLocation(opts: {
  city: unknown; area?: unknown; userId: string; coords?: Coords; allowCreate?: boolean;
}): Promise<{ cityDoc: any | null; areaDoc: any | null; created: string[] }> {
  const allowCreate = opts.allowCreate !== false;
  const cityName = cleanPlaceName(opts.city);
  const areaName = opts.area ? cleanPlaceName(opts.area) : "";
  const coords = inPk(opts.coords ?? null) ? opts.coords! : null;
  const created: string[] = [];
  if (!cityName) return { cityDoc: null, areaDoc: null, created };

  const citySlug = seg(cityName);
  if (!citySlug) throw new LocationError("Please write the city name in English letters");
  let cityDoc: any = await City.findOne({ $or: [{ slug: citySlug }, { name: rx(cityName) }] });
  if (!cityDoc) {
    if (!allowCreate) return { cityDoc: null, areaDoc: null, created };
    if (!(await slugIsFree(citySlug))) throw new LocationError(`"${cityName}" can't be used as a city name`);
    await checkQuota(opts.userId);
    // The named place's own position beats the seller's GPS (they may be posting from another city).
    const geo = (await geocode(`${cityName}, Pakistan`)) || (coords && { ...coords, state: undefined });
    cityDoc = await City.create({
      name: cityName, slug: citySlug, stateName: (geo as any)?.state || null,
      latitude: geo?.lat ?? null, longitude: geo?.lng ?? null,
      isActive: true, order: 999, source: "user", addedBy: opts.userId,
    });
    created.push(`city ${cityName}`);
  }

  let areaDoc: any = null;
  if (areaName) {
    const areaSlug = seg(areaName);
    if (!areaSlug) throw new LocationError("Please write the area name in English letters");
    areaDoc = await Area.findOne({ cityId: cityDoc._id, $or: [{ slug: areaSlug }, { name: rx(areaName) }] });
    if (!areaDoc && allowCreate) {
      if (!(await slugIsFree(areaSlug))) throw new LocationError(`"${areaName}" can't be used as an area name`);
      await checkQuota(opts.userId);
      const center = cityDoc.latitude != null ? { lat: cityDoc.latitude, lng: cityDoc.longitude } : null;
      // Map lookup of the area first; else the seller's GPS if it's in/near
      // that city; else the city centre.
      const near = (p: Coords) => !!p && (!center || km(p, center) < 45);
      const g = await geocode(`${areaName}, ${cityDoc.name}, Pakistan`);
      const pos: Coords = near(g) ? { lat: g!.lat, lng: g!.lng } : near(coords) ? coords : center;
      areaDoc = await Area.create({
        name: areaName, slug: areaSlug, cityId: cityDoc._id, citySlug: cityDoc.slug,
        latitude: pos?.lat ?? null, longitude: pos?.lng ?? null,
        isActive: true, source: "user", addedBy: opts.userId,
      });
      created.push(`area ${areaName}`);
    }
  }

  if (created.length) expireTag("locations");
  return { cityDoc, areaDoc, created };
}
