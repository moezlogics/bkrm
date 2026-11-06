import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";
import Area from "@/models/Area";
import { nearest } from "@/lib/geo";
import { getSettings } from "@/lib/settings";

/**
 * GET /api/geo/ip
 * Best-effort IP → nearest city/area, used as a fallback when the browser
 * denies GPS.
 *
 * This is the LAST step of the detection chain, so it must always land on a
 * city: if the IP is private (localhost/LAN) or the lookup fails, it returns
 * the configured default city instead of `success:false`. Returning a failure
 * left the visitor with no location at all — no personalised feed, no
 * city-scoped links, which read as "nothing is automatic".
 */
function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

const isPrivate = (ip: string) =>
  !ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:192.168.");

/** Configured default city (or the first active one) — never fails to a blank. */
async function defaultCity(reason: string) {
  await dbConnect();
  const settings = await getSettings();
  const wanted = settings.default_city || "";
  const city =
    (wanted ? await City.findOne({ name: wanted, isActive: true }).select("name slug").lean<any>() : null) ||
    (await City.findOne({ isActive: true }).sort({ order: 1 }).select("name slug").lean<any>());
  if (!city) return NextResponse.json({ success: false, reason: "no-cities" });
  return NextResponse.json({
    success: true,
    data: { name: city.name, slug: city.slug, area: null, source: "default", reason },
  });
}

export async function GET(req: NextRequest) {
  try {
    const ip = clientIp(req) || "";
    if (isPrivate(ip)) return defaultCity("local-ip");

    // ip-api.com — free, no key (http). 45 req/min limit is fine for a fallback.
    let lat: number | null = null, lng: number | null = null;
    try {
      const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon,country,countryCode`, { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      if (j?.status === "success") { lat = j.lat; lng = j.lon; }
    } catch { /* geo service down → fall through */ }

    if (lat == null || lng == null) return defaultCity("geo-unavailable");

    await dbConnect();
    const cities = await City.find({ isActive: true }).select("name slug latitude longitude").lean();
    const cityHit = nearest(cities as any[], lat, lng);
    if (!cityHit) return defaultCity("no-nearest");
    const city = cityHit.item;

    let area: any = null;
    const areas = await Area.find({ cityId: (city as any)._id, isActive: true }).select("name slug latitude longitude").lean();
    const areaHit = nearest(areas as any[], lat, lng);
    if (areaHit) area = { name: areaHit.item.name, slug: areaHit.item.slug };

    return NextResponse.json({ success: true, data: { name: city.name, slug: city.slug, area, source: "ip" } });
  } catch (e: any) {
    try { return await defaultCity("error"); }
    catch { return NextResponse.json({ success: false, reason: e.message }, { status: 200 }); }
  }
}
