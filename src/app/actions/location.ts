"use server";

import { cookies } from "next/headers";
import { getVisitorLocation, resolveLocation } from "@/lib/visitor-location";
import { setLocationCookies } from "@/lib/location-cookies";

/**
 * Make the city being browsed the visitor's location (OLX behaviour).
 *
 * A Server Action rather than a fetch to /api/location on purpose: setting a
 * cookie inside a Server Action invalidates the whole client router cache,
 * so pages prefetched for the previous city (home, category tiles) can't be
 * served afterwards. A route handler can't do that.
 */
export async function syncCityAction(citySlug: string): Promise<boolean> {
  const current = await getVisitorLocation();
  if (current.city?.slug === citySlug) return false;
  const next = await resolveLocation(citySlug, null, null, null, "manual");
  if (!next.city) return false;
  setLocationCookies(await cookies(), { citySlug: next.city.slug, areaSlug: null, source: "manual" });
  return true;
}
