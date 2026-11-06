import { NextRequest, NextResponse } from "next/server";
import {
  resolveLocation, nearestPlace, toClientLocation, getVisitorLocation, ALL_PAKISTAN,
} from "@/lib/visitor-location";
import { setLocationCookies, lookupIp, defaultCitySlug } from "@/lib/location-cookies";
import { relocatePath } from "@/lib/location-path";
import { getServerSession } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { saveProfileLocation, slugsFromProfile, profileMatches } from "@/lib/profile-location";

/**
 * GET  /api/location          → the visitor's current location
 * POST /api/location          → set it
 *   { lat, lng }              GPS fix  → nearest city + area, precise point
 *   { mode: "ip" }            IP lookup → nearest city + area (default city when private/unknown)
 *   { city, area? }           explicit choice ("pk" = all Pakistan)
 *   { mode: "sync" }          logged in: line this device up with the profile (see below)
 *   + next?: current path     → response includes `redirect`, the same page in the new location
 *
 * Logged-in people have ONE location: a place chosen here (or a GPS fix) is
 * saved to their profile, and on a device that only has an IP guess the
 * profile's city is used instead (lib/profile-location).
 *
 * Auto-detection (gps/ip) never overrides a location the visitor picked
 * themselves — pass `force: true` for the explicit "use my location" button.
 */
export async function GET() {
  const loc = await getVisitorLocation();
  return NextResponse.json({ success: true, data: toClientLocation(loc) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const current = await getVisitorLocation();
    const session = await getServerSession().catch(() => null);

    if (body.mode === "sync") {
      if (!session) return NextResponse.json({ success: true, changed: false, data: toClientLocation(current) });
      await dbConnect();
      const user: any = await User.findById(session.userId).select("city area").lean();
      if (!user) return NextResponse.json({ success: true, changed: false, data: toClientLocation(current) });
      // A place picked on this device (or a GPS fix) is the newest word → profile.
      if (current.source === "manual" || current.source === "gps") {
        if (current.city && !profileMatches(user, current)) await saveProfileLocation(session.userId, current);
        return NextResponse.json({ success: true, changed: false, data: toClientLocation(current) });
      }
      // Only an IP guess (or nothing) here → the profile's city wins.
      const slugs = await slugsFromProfile(user.city, user.area);
      if (slugs) {
        const next = await resolveLocation(slugs.citySlug, slugs.areaSlug, null, null, "manual");
        const changed = next.city?.slug !== current.city?.slug || next.area?.slug !== current.area?.slug || !current.chosen;
        const res = NextResponse.json({ success: true, changed, data: toClientLocation(next) });
        setLocationCookies(res, { citySlug: next.city?.slug ?? null, areaSlug: next.area?.slug ?? null, source: "manual" });
        return res;
      }
      // No profile city yet: fill it from what this device knows.
      if (current.city) await saveProfileLocation(session.userId, current, { onlyIfEmpty: true });
      if (current.chosen) return NextResponse.json({ success: true, changed: false, data: toClientLocation(current) });
      body.mode = "ip"; // nothing anywhere — fall through to the IP guess
    }

    // Precedence: manual > gps > ip. An automatic update may only replace a
    // weaker source — an IP guess must never overwrite a GPS fix, and neither
    // may overwrite what the visitor picked.
    const keep =
      (body.mode === "ip" && (current.source === "manual" || current.source === "gps")) ||
      (body.lat != null && !body.force && current.source === "manual");
    if (keep) {
      return NextResponse.json({ success: true, changed: false, data: toClientLocation(current) });
    }

    let citySlug: string | null = null;
    let areaSlug: string | null = null;
    let lat: number | null = null;
    let lng: number | null = null;
    let source: "gps" | "ip" | "manual";

    if (body.lat != null && body.lng != null) {
      lat = Number(body.lat);
      lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return NextResponse.json({ success: false, message: "Invalid coordinates" }, { status: 400 });
      }
      const hit = await nearestPlace(lat, lng);
      if (!hit) return NextResponse.json({ success: false, message: "No cities configured" }, { status: 404 });
      ({ citySlug, areaSlug } = hit);
      source = "gps";
    } else if (body.mode === "ip") {
      // An IP fix is only approximate, so it doesn't keep coordinates —
      // distance ranking uses the resolved area/city centre instead.
      const ip = await lookupIp(req);
      const hit = ip ? await nearestPlace(ip.lat, ip.lng) : null;
      citySlug = hit?.citySlug ?? (await defaultCitySlug());
      areaSlug = hit?.areaSlug ?? null;
      source = "ip";
    } else {
      citySlug = body.city === ALL_PAKISTAN ? null : body.city || null;
      areaSlug = body.area || null;
      source = "manual";
    }

    const next = await resolveLocation(citySlug ?? ALL_PAKISTAN, areaSlug, lat, lng, source);
    const changed =
      next.city?.slug !== current.city?.slug ||
      next.area?.slug !== current.area?.slug ||
      next.precise !== current.precise ||
      !current.chosen;

    // When the caller says where it is, return the same page re-homed to the
    // new location (/lahore/cars → /karachi/cars).
    const redirect = typeof body.next === "string"
      ? await relocatePath(body.next, next.city?.slug ?? null, next.area?.slug ?? null)
      : null;

    // Logged in → the profile follows (an IP guess only fills an empty profile).
    if (session && next.city) {
      await dbConnect();
      await saveProfileLocation(session.userId, next, { onlyIfEmpty: source === "ip" });
    }

    const res = NextResponse.json({ success: true, changed, redirect, data: toClientLocation(next) });
    setLocationCookies(res, {
      citySlug: next.city?.slug ?? null,
      areaSlug: next.area?.slug ?? null,
      lat: next.precise ? lat : null,
      lng: next.precise ? lng : null,
      source,
    });
    return res;
  } catch (e: any) {
    console.error("location POST:", e);
    return NextResponse.json({ success: false, message: e.message || "Failed" }, { status: 500 });
  }
}
