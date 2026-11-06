import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { getBranding } from "@/lib/branding";

/**
 * Web app manifest — built from the admin's branding settings.
 *
 * Needed so people can install the site. On iPhone that's the only way
 * notifications are allowed at all (Add to Home Screen, then open it from
 * there), and on Android it makes the notification icon and colours match.
 *
 * Under a base path (example.com/cars) start_url, scope and icons carry
 * it, so the installed app is the marketplace — not the main site that shares
 * the domain.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const withBase = (u: string) => (u.startsWith("/") && !u.startsWith("//") && !(BASE && u.startsWith(`${BASE}/`)) ? `${BASE}${u}` : u);

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings().catch(() => ({} as Record<string, string>));
  const brand = getBranding(s);
  const icon = withBase(brand.favicon || s.site_logo || "/brand-icon");
  const type = icon.endsWith(".png") ? "image/png" : icon.endsWith(".webp") ? "image/webp" : undefined;
  return {
    name: `${s.site_name || "Marketplace"} — ${s.site_tagline || ""}`.trim().replace(/[—-]\s*$/, ""),
    short_name: s.site_name || "Marketplace",
    description: s.site_tagline || undefined,
    id: `${BASE}/`,
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: s.brand_color || "#1a56db",
    icons: [
      { src: icon, sizes: "192x192", ...(type ? { type } : {}) },
      { src: icon, sizes: "512x512", ...(type ? { type } : {}) },
      { src: icon, sizes: "any", purpose: "maskable", ...(type ? { type } : {}) },
    ],
  };
}
