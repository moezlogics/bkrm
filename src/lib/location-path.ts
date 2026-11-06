/**
 * Location-aware path handling (server-only).
 *
 * Browse URLs are location-first: /<city>/<area>/<category-path>. When the
 * visitor switches location we keep them on the same category in the new
 * place — /lahore/cars → /karachi/cars — which is what OLX
 * does. Pages that aren't location-scoped (an ad, chat, dashboard) are left
 * alone; they re-render against the new location in place.
 */
import { getCatalog } from "@/lib/catalog";

/** Only same-site relative paths — never let `next` become an open redirect. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

export function buildLocationPath(citySlug: string | null, areaSlug: string | null, rest: string): string {
  const segs = [citySlug, citySlug ? areaSlug : null, ...rest.split("/")].filter(Boolean);
  return "/" + segs.join("/");
}

/**
 * Split a path into its location prefix and the remainder.
 * `isArchive` is true when the path is a browse page that should follow the
 * visitor's location.
 */
export async function splitLocationPath(pathname: string): Promise<{
  citySlug: string | null;
  areaSlug: string | null;
  rest: string;
  isArchive: boolean;
}> {
  const segs = pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  if (!segs.length) return { citySlug: null, areaSlug: null, rest: "", isArchive: false };

  const catalog = await getCatalog();
  const city = catalog.city(segs[0]);
  if (city) {
    let areaSlug: string | null = null;
    let restSegs = segs.slice(1);
    if (restSegs.length) {
      const area = catalog.area(city.slug, restSegs[0]);
      if (area) { areaSlug = area.slug; restSegs = restSegs.slice(1); }
    }
    return { citySlug: city.slug, areaSlug, rest: restSegs.join("/"), isArchive: true };
  }

  // No location prefix — it's an archive only if the whole path is a category.
  const rest = segs.join("/");
  return { citySlug: null, areaSlug: null, rest, isArchive: !!catalog.categoryByPath(rest) };
}

/** Re-home `next` under a new location if it's a browse page; otherwise keep it. */
export async function relocatePath(next: string, citySlug: string | null, areaSlug: string | null): Promise<string> {
  const safe = safeNext(next);
  const [pathname, query = ""] = safe.split("?");
  if (pathname === "/") return safe; // the homepage re-renders for the new location

  const parts = await splitLocationPath(pathname);
  if (!parts.isArchive) return safe;

  // Area chips/pages carry `?page=` etc. that no longer apply to the new place.
  const params = new URLSearchParams(query);
  params.delete("page");
  const qs = params.toString();
  return buildLocationPath(citySlug, areaSlug, parts.rest) + (qs ? `?${qs}` : "");
}
