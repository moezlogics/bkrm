import { NextRequest, NextResponse } from "next/server";
import { resolveLocation, ALL_PAKISTAN } from "@/lib/visitor-location";
import { relocatePath, safeNext } from "@/lib/location-path";
import { setLocationCookies } from "@/lib/location-cookies";
import { withBasePath } from "@/lib/base-path";
import { getServerSession } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { saveProfileLocation } from "@/lib/profile-location";

/**
 * GET /go/location?city=<slug|pk>&area=<slug>&next=<path>
 *
 * The location picker's links point here. It records the choice as a manual
 * location, then sends the visitor back to what they were looking at — in the
 * new place (/lahore/cars → /karachi/cars). Plain links, so
 * switching works before hydration and needs no client state.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cityParam = (url.searchParams.get("city") || "").toLowerCase();
  const areaParam = (url.searchParams.get("area") || "").toLowerCase();
  const next = safeNext(url.searchParams.get("next"));

  const loc = await resolveLocation(cityParam || ALL_PAKISTAN, areaParam || null, null, null, "manual");
  const citySlug = loc.city?.slug ?? null;
  const areaSlug = loc.area?.slug ?? null;

  // Logged in → this is now their profile location too (header and settings agree).
  const session = await getServerSession().catch(() => null);
  if (session && loc.city) {
    await dbConnect();
    await saveProfileLocation(session.userId, loc);
  }

  const target = await relocatePath(next, citySlug, areaSlug);
  const res = NextResponse.redirect(new URL(withBasePath(target), url.origin), 302);
  setLocationCookies(res, { citySlug, areaSlug, source: "manual" });
  return res;
}
