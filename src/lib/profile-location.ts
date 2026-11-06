/**
 * One location per person: the header's location (chosen, GPS or IP) and the
 * city/area in their profile stay the same thing.
 *
 *  header / GPS change while logged in → saved to the profile
 *  profile saved with a city/area       → becomes the header location (cookies)
 *  logging in on a device that only has an IP guess → the profile's city wins
 *
 * The profile stores names (it's what the seller page shows); the cookies
 * store slugs — both are mapped through the cached catalog.
 */
import User from "@/models/User";
import { getCatalog } from "@/lib/catalog";
import type { VisitorLocation } from "@/lib/visitor-location";

const same = (a?: string | null, b?: string | null) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

/** Save a resolved location to the profile. "All Pakistan" never clears a profile city. */
export async function saveProfileLocation(userId: string, loc: Pick<VisitorLocation, "city" | "area">, o: { onlyIfEmpty?: boolean } = {}) {
  if (!userId || !loc.city) return;
  const filter: Record<string, unknown> = { _id: userId };
  if (o.onlyIfEmpty) filter.$or = [{ city: null }, { city: "" }, { city: { $exists: false } }];
  await User.updateOne(filter, { $set: { city: loc.city.name, area: loc.area?.name || null } }).catch(() => {});
}

/** Profile city/area names → catalog slugs (null when the city isn't one we list). */
export async function slugsFromProfile(city?: string | null, area?: string | null): Promise<{ citySlug: string; areaSlug: string | null } | null> {
  if (!city || !city.trim()) return null;
  const catalog = await getCatalog();
  const c = catalog.cities.find((x) => same(x.name, city) || same(x.slug, city));
  if (!c) return null;
  const a = area ? catalog.areasOf(c.slug).find((x) => same(x.name, area) || same(x.slug, area)) : undefined;
  return { citySlug: c.slug, areaSlug: a?.slug ?? null };
}

/** The profile already says this place (no write needed). */
export function profileMatches(user: { city?: string | null; area?: string | null }, loc: Pick<VisitorLocation, "city" | "area">) {
  return same(user.city, loc.city?.name) && same(user.area || "", loc.area?.name || "");
}
