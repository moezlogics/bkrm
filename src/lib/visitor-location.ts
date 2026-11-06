/**
 * Visitor location — the single source of truth for personalisation.
 *
 * OLX model: a visitor is always "somewhere" — Pakistan, a city, or an area
 * inside a city — and every page (home feed, category links, search, related
 * ads, the post form) follows that choice. We add one thing OLX doesn't show:
 * a real point on the map, so feeds can be ordered nearest-first.
 *
 * State lives only in cookies (read server-side, so there is no flash of the
 * wrong city on first paint). It used to be split between localStorage and
 * cookies, and the two drifted out of sync.
 *
 *   loc_city  city slug, or "pk" when the visitor explicitly chose all Pakistan
 *   loc_area  area slug within that city (optional)
 *   loc_lat / loc_lng   GPS fix (optional; cleared on a manual switch)
 *   loc_src   "gps" | "ip" | "manual" — how the location was set. Auto-detect
 *             never overrides a manual choice.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import { haversine } from "@/lib/geo";
import { getCatalog } from "@/lib/catalog";

export const LOC = {
  city: "loc_city",
  area: "loc_area",
  lat: "loc_lat",
  lng: "loc_lng",
  src: "loc_src",
} as const;

export const LOC_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
export const ALL_PAKISTAN = "pk";

export type LocSource = "gps" | "ip" | "manual";

export interface LocPlace {
  _id: string;
  name: string;
  slug: string;
  lat: number | null;
  lng: number | null;
}

export interface VisitorLocation {
  city: LocPlace | null;
  area: LocPlace | null;
  /** [lng, lat] used for distance ranking — GPS, else area centre, else city centre. */
  point: [number, number] | null;
  /** True when `point` is the visitor's own GPS fix rather than an area/city centre. */
  precise: boolean;
  /** Has a location been set at all (including an explicit "all Pakistan")? */
  chosen: boolean;
  source: LocSource | null;
  /** "Gulberg, Lahore" · "Lahore" · "Pakistan" */
  label: string;
  /** URL prefix for location-scoped links: "/lahore/gulberg" · "/lahore" · "" */
  prefix: string;
}

export const NO_LOCATION: VisitorLocation = {
  city: null, area: null, point: null, precise: false, chosen: false,
  source: null, label: "Pakistan", prefix: "",
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};

const place = (d: any): LocPlace => ({
  _id: String(d._id),
  name: d.name,
  slug: d.slug,
  lat: num(d.latitude),
  lng: num(d.longitude),
});

/** A GPS fix further than this from the chosen city is stale (visitor moved or switched). */
const GPS_TRUST_KM = 60;

/**
 * Resolve slugs (+ optional GPS) into a full location. Unknown or inactive
 * slugs degrade to "no location" rather than throwing.
 */
export async function resolveLocation(
  citySlug?: string | null,
  areaSlug?: string | null,
  lat?: unknown,
  lng?: unknown,
  source: LocSource | null = null
): Promise<VisitorLocation> {
  if (citySlug === ALL_PAKISTAN) {
    return { ...NO_LOCATION, chosen: true, source: source ?? "manual" };
  }
  if (!citySlug) return NO_LOCATION;

  // Resolved from the cached catalog — no database round trip per request.
  const catalog = await getCatalog();
  const cityDoc = catalog.city(citySlug);
  if (!cityDoc) return NO_LOCATION;
  const city = place(cityDoc);

  let area: LocPlace | null = null;
  if (areaSlug) {
    const areaDoc = catalog.area(city.slug, areaSlug);
    if (areaDoc) area = place(areaDoc);
  }

  // Pick the most specific point we can trust.
  const gLat = num(lat);
  const gLng = num(lng);
  let point: [number, number] | null = null;
  let precise = false;
  if (
    gLat != null && gLng != null && city.lat != null && city.lng != null &&
    haversine(gLat, gLng, city.lat, city.lng) <= GPS_TRUST_KM
  ) {
    point = [gLng, gLat];
    precise = true;
  } else if (area?.lat != null && area?.lng != null) {
    point = [area.lng, area.lat];
  } else if (city.lat != null && city.lng != null) {
    point = [city.lng, city.lat];
  }

  return {
    city,
    area,
    point,
    precise,
    chosen: true,
    source,
    label: area ? `${area.name}, ${city.name}` : city.name,
    prefix: area ? `/${city.slug}/${area.slug}` : `/${city.slug}`,
  };
}

/** The current visitor's location, read from cookies once per request. */
export const getVisitorLocation = cache(async (): Promise<VisitorLocation> => {
  try {
    const jar = await cookies();
    const src = jar.get(LOC.src)?.value;
    return await resolveLocation(
      jar.get(LOC.city)?.value,
      jar.get(LOC.area)?.value,
      jar.get(LOC.lat)?.value,
      jar.get(LOC.lng)?.value,
      src === "gps" || src === "ip" || src === "manual" ? src : null
    );
  } catch {
    return NO_LOCATION;
  }
});

/** Nearest active city (and nearest area within it) to a coordinate. */
export async function nearestPlace(lat: number, lng: number): Promise<{ citySlug: string; areaSlug: string | null } | null> {
  const catalog = await getCatalog();
  const cities = catalog.cities;
  let best: any = null;
  let bestD = Infinity;
  for (const c of cities as any[]) {
    if (c.latitude == null || c.longitude == null) continue;
    const d = haversine(lat, lng, c.latitude, c.longitude);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return null;

  const areas = catalog.areasOf(best.slug);
  let bestArea: any = null;
  let bestAreaD = Infinity;
  for (const a of areas as any[]) {
    if (a.latitude == null || a.longitude == null) continue;
    const d = haversine(lat, lng, a.latitude, a.longitude);
    if (d < bestAreaD) { bestAreaD = d; bestArea = a; }
  }
  return { citySlug: best.slug, areaSlug: bestArea?.slug ?? null };
}

/** Shape passed to client components (header, nav, post form). */
export interface ClientLocation {
  label: string;
  prefix: string;
  chosen: boolean;
  source: LocSource | null;
  precise: boolean;
  city: { name: string; slug: string } | null;
  area: { name: string; slug: string } | null;
}

export function toClientLocation(l: VisitorLocation): ClientLocation {
  return {
    label: l.label,
    prefix: l.prefix,
    chosen: l.chosen,
    source: l.source,
    precise: l.precise,
    city: l.city ? { name: l.city.name, slug: l.city.slug } : null,
    area: l.area ? { name: l.area.name, slug: l.area.slug } : null,
  };
}

export const oid = (id: string) => new mongoose.Types.ObjectId(String(id));

/**
 * Compact city → areas name map for client components (the header derives the
 * location of the page being viewed from its URL with it). Tiny — tens of
 * entries — and cached across requests; admin location edits bust the tag.
 */
export type PlacesMap = Record<string, { name: string; areas: Record<string, string> }>;

export async function getPlacesMap(): Promise<PlacesMap> {
  const catalog = await getCatalog();
  const map: PlacesMap = {};
  for (const c of catalog.cities) map[c.slug] = { name: c.name, areas: {} };
  for (const a of catalog.areas) if (map[a.citySlug]) map[a.citySlug].areas[a.slug] = a.name;
  return map;
}
