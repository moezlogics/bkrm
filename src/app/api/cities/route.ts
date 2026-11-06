import { NextRequest, NextResponse } from "next/server";
import { getCatalog, type CatalogCity } from "@/lib/catalog";
import { getScopeCounts } from "@/lib/scope-counts";

// Same answer for everyone and a few seconds of staleness is harmless in a
// picker — browsers and any edge cache reuse it.
const CACHE = { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" };

/**
 * Public locations endpoint (powers the location picker).
 *  GET /api/cities                  → active cities, with live ad counts
 *  GET /api/cities?citySlug=lahore  → active areas of that city, with live ad counts
 *
 * Counts are live approved-ad counts from the shared scope counts (one
 * background pass, lib/scope-counts) — not a group-by over every listing each
 * time someone opens the picker. OLX shows the same "DHA Defence (500)" style
 * counts so people pick areas that have stock.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const citySlug = searchParams.get("citySlug");
    const [catalog, scope] = await Promise.all([getCatalog(), getScopeCounts()]);

    if (citySlug) {
      const city = catalog.city(citySlug);
      if (!city) return NextResponse.json({ success: true, data: [] }, { headers: CACHE });
      const areas = catalog.areasOf(city.slug).map((a) => ({ _id: a._id, name: a.name, slug: a.slug, citySlug: a.citySlug }));
      const byArea = scope.cityAreas.get(String(city._id)) || new Map<string, number>();
      const data = (areas as any[])
        .map((a) => ({ ...a, count: byArea.get(String(a._id)) || 0 }))
        // Areas with stock first, then alphabetical — the useful ones on top.
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      return NextResponse.json({ success: true, data }, { headers: CACHE });
    }

    const cities = catalog.cities.map((c: CatalogCity) => ({ _id: c._id, name: c.name, slug: c.slug, stateName: c.stateName }));
    const data = cities.map((c) => ({ ...c, count: scope.city.get(String(c._id)) || 0 }));
    return NextResponse.json({ success: true, data }, { headers: CACHE });
  } catch (error: any) {
    console.error("GET cities:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
