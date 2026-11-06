import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createHash, randomBytes } from "crypto";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import PushSubscriber from "@/models/PushSubscriber";
import { getServerSession } from "@/lib/auth";
import { getVisitorLocation } from "@/lib/visitor-location";
import { getCatalog } from "@/lib/catalog";
import { parseUA } from "@/lib/push/ua";
import { bumpStat } from "@/lib/push/stats";
import { getPushConfig, getPushBranding, renderTemplate } from "@/lib/push/config";
import { sendBatch } from "@/lib/push/send";
import { once } from "@/lib/push/once";
import { TtlLru } from "@/lib/memo";

/**
 * POST   /api/push/subscribe  { subscription, source?, oldEndpoint? } — a browser allowed
 *        notifications, or checks in (location, account and device kept current).
 * PATCH  /api/push/subscribe  { endpoint, detach: true } — signing out on this device.
 * DELETE /api/push/subscribe  { endpoint } — notifications turned off on this device.
 */

// Browsers subscribe through their vendor's push service. Only those hosts are
// accepted: otherwise anyone could register an internal address and make this
// server send requests to it. PUSH_ENDPOINT_HOSTS adds more (comma-separated);
// PUSH_TEST_ENDPOINTS=1 allows https://localhost for automated tests.
const PUSH_HOSTS = [
  "fcm.googleapis.com", "android.googleapis.com",        // Chrome, Android, Samsung, Opera
  "updates.push.services.mozilla.com", "push.services.mozilla.com", // Firefox
  "web.push.apple.com",                                  // Safari / iOS home-screen apps
  "notify.windows.com",                                  // Edge (WNS)
  ...(process.env.PUSH_ENDPOINT_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean),
];
function validEndpoint(u: unknown): string | null {
  if (typeof u !== "string" || u.length > 1024) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return u;
    if (process.env.PUSH_TEST_ENDPOINTS === "1" && (host === "localhost" || host === "127.0.0.1")) return u;
  } catch { /* fall through */ }
  return null;
}
const b64url = (v: unknown, min: number, max: number) =>
  typeof v === "string" && v.length >= min && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v) ? v : null;

// A few check-ins per device per minute is plenty; this stops floods.
const hits = new TtlLru<number>(20_000, 60_000);
function limited(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  return n > 30;
}

export async function POST(req: NextRequest) {
  if (limited(req)) return NextResponse.json({ success: false, message: "Too many requests" }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const endpoint = validEndpoint(b?.subscription?.endpoint);
  const p256dh = b64url(b?.subscription?.keys?.p256dh, 80, 100);
  const auth = b64url(b?.subscription?.keys?.auth, 16, 30);
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ success: false, message: "Invalid subscription" }, { status: 400 });

  await dbConnect();
  const [session, loc, catalog] = await Promise.all([getServerSession(), getVisitorLocation(), getCatalog()]);
  const user: any = session ? await User.findById(session.userId).select("isSeller pushOff city").lean() : null;

  // Where the device is: the location the visitor browses with, else the city on their profile.
  let city = loc.city ? catalog.city(loc.city.slug) : undefined;
  if (!city && user?.city) city = catalog.cities.find((c) => c.name.toLowerCase() === String(user.city).toLowerCase());
  const area = loc.city && loc.area && city ? catalog.area(city.slug, loc.area.slug) : undefined;
  const ua = parseUA(req.headers.get("user-agent") || "");
  const lang = (req.headers.get("accept-language") || "").split(",")[0].trim().slice(0, 12) || null;

  const set: Record<string, unknown> = {
    endpoint,
    keys: { p256dh, auth },
    status: "active",
    endedAt: null,
    failCount: 0,
    lastSeenAt: new Date(),
    ...ua,
    lang,
    ...(city ? { cityId: city._id, city: city.name, state: city.stateName || null } : {}),
    ...(area ? { areaId: area._id, area: area.name } : city ? { areaId: null, area: null } : {}),
  };
  // A signed-in check-in (re)assigns the device to that account. A signed-out
  // one leaves the owner alone — signing out detaches explicitly (PATCH).
  if (user) Object.assign(set, { userId: user._id, isSeller: !!user.isSeller, promoOff: (user.pushOff || []).includes("promotions") });

  // The browser rotated its subscription: move the old record over.
  const old = validEndpoint(b?.oldEndpoint);
  if (old && old !== endpoint) {
    if (!(await PushSubscriber.exists({ endpoint }))) await PushSubscriber.updateOne({ endpoint: old }, { $set: { endpoint } });
    else await PushSubscriber.updateOne({ endpoint: old, status: "active" }, { $set: { status: "expired", endedAt: new Date() } });
  }

  const before: any = await PushSubscriber.findOne({ endpoint }).select("status").lean();
  await PushSubscriber.updateOne(
    { endpoint },
    { $set: set, $setOnInsert: { source: String(b?.source || "prompt").slice(0, 20) } },
    { upsert: true },
  );
  const isNew = !before || before.status !== "active";
  if (isNew) {
    bumpStat("subscriber", { subscribed: 1 });
    const silent = ["sync", "rotate"].includes(String(b?.source));
    if (!silent) after(() => welcome(endpoint, p256dh, auth));
  }
  return NextResponse.json({ success: true, new: isNew });
}

/** One welcome push, only to the device that just allowed notifications. */
async function welcome(endpoint: string, p256dh: string, auth: string) {
  try {
    const cfg = await getPushConfig();
    if (!cfg.enabled || !cfg.auto.welcome?.enabled) return;
    if (!(await once(`welcome:${createHash("sha1").update(endpoint).digest("hex")}`, 24 * 365))) return;
    const brand = await getPushBranding();
    const r = await sendBatch([{ endpoint, keys: { p256dh, auth } }], {
      title: renderTemplate(cfg.auto.welcome.title, {}, brand.siteName),
      body: renderTemplate(cfg.auto.welcome.body, {}, brand.siteName),
      url: "/", icon: brand.icon, badge: brand.badge || null, type: "welcome", id: randomBytes(6).toString("base64url"),
    }, { urgency: "high" });
    bumpStat("welcome", { sent: r.sent, failed: r.failed + r.removed });
  } catch (e: any) {
    console.error("[push] welcome failed:", e?.message);
  }
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const endpoint = validEndpoint(b?.endpoint);
  if (!endpoint || !b?.detach) return NextResponse.json({ success: false }, { status: 400 });
  await dbConnect();
  await PushSubscriber.updateOne({ endpoint }, { $set: { userId: null, isSeller: false, promoOff: false } });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const endpoint = validEndpoint(b?.endpoint);
  if (!endpoint) return NextResponse.json({ success: false }, { status: 400 });
  await dbConnect();
  const r = await PushSubscriber.updateOne({ endpoint, status: "active" }, { $set: { status: "unsubscribed", endedAt: new Date() } });
  if (r.modifiedCount) bumpStat("subscriber", { unsubscribed: 1 });
  return NextResponse.json({ success: true });
}
