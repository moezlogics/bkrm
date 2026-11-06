import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";
import Area from "@/models/Area";
import { nearest } from "@/lib/geo";

/**
 * GET /api/cities/detect?lat=&lng=
 * Nearest active city + nearest active area within that city (Haversine).
 * Powers the GPS / IP auto-detect flow ("apka sheher, apka nazdeek area").
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") || "");
    const lng = parseFloat(searchParams.get("lng") || "");

    await dbConnect();
    const cities = await City.find({ isActive: true })
      .select("name slug latitude longitude order")
      .sort({ order: 1 })
      .lean();

    if (!cities.length) return NextResponse.json({ success: false, message: "No cities" }, { status: 404 });

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ success: true, data: { slug: cities[0].slug, name: cities[0].name, fallback: true } });
    }

    const cityHit = nearest(cities as any[], lat, lng);
    const city = cityHit?.item || cities[0];

    // Nearest area within the chosen city
    let area: any = null;
    const areas = await Area.find({ cityId: city._id, isActive: true })
      .select("name slug latitude longitude citySlug")
      .lean();
    const areaHit = nearest(areas as any[], lat, lng);
    if (areaHit) area = { name: areaHit.item.name, slug: areaHit.item.slug };

    return NextResponse.json({
      success: true,
      data: { slug: city.slug, name: city.name, distance: cityHit?.distance ?? null, area },
    });
  } catch (error: any) {
    console.error("city detect error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
