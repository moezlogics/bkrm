/**
 * Writing the visitor-location cookies (route handlers only) + IP geolocation.
 */
import type { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";
import { getSettings } from "@/lib/settings";
import { LOC, LOC_MAX_AGE, ALL_PAKISTAN, type LocSource } from "@/lib/visitor-location";

const opts = { path: "/", maxAge: LOC_MAX_AGE, sameSite: "lax" as const };

/** Anything with a cookie `set` — a NextResponse's cookies or `await cookies()`. */
type CookieWriter = { set(name: string, value: string, options?: Record<string, unknown>): unknown };

export function setLocationCookies(
  target: NextResponse | CookieWriter,
  v: { citySlug: string | null; areaSlug?: string | null; lat?: number | null; lng?: number | null; source: LocSource }
) {
  const jar: CookieWriter = "cookies" in target ? target.cookies : target;
  jar.set(LOC.city, v.citySlug || ALL_PAKISTAN, opts);
  jar.set(LOC.area, v.areaSlug || "", opts);
  jar.set(LOC.src, v.source, opts);
  if (v.lat != null && v.lng != null) {
    jar.set(LOC.lat, v.lat.toFixed(5), opts);
    jar.set(LOC.lng, v.lng.toFixed(5), opts);
  } else {
    // A manual or IP location must not keep an old GPS fix from elsewhere.
    jar.set(LOC.lat, "", { ...opts, maxAge: 0 });
    jar.set(LOC.lng, "", { ...opts, maxAge: 0 });
  }
}

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "";
}

const isPrivate = (ip: string) =>
  !ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:192.168.");

/** Best-effort IP → coordinates. Null for private IPs or when the service is down. */
export async function lookupIp(req: NextRequest): Promise<{ lat: number; lng: number } | null> {
  const ip = clientIp(req);
  if (isPrivate(ip)) return null;
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon`, { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    if (j?.status === "success" && typeof j.lat === "number") return { lat: j.lat, lng: j.lon };
  } catch { /* fall through to the default city */ }
  return null;
}

/** Configured default city, else the first active one. */
export async function defaultCitySlug(): Promise<string | null> {
  await dbConnect();
  const wanted = (await getSettings()).default_city || "";
  const city =
    (wanted ? await City.findOne({ name: wanted, isActive: true }).select("slug").lean<any>() : null) ||
    (await City.findOne({ isActive: true }).sort({ order: 1 }).select("slug").lean<any>());
  return city?.slug ?? null;
}
