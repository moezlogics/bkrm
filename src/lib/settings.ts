/**
 * Settings accessor — reads the Setting K/V store so branding/config is
 * data-driven (no hard-coded "PKR"/"Pakistan"/site name in components).
 *
 * Cached per request via React cache to avoid repeat DB hits in a render pass.
 */
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import dbConnect from "@/lib/mongodb";
import Setting from "@/models/Setting";
import { VERTICAL } from "@/vertical";

export const SETTINGS_TAG = "settings";

export const DEFAULT_SETTINGS: Record<string, string> = {
  // Name and copy default to the vertical's (src/vertical/*); the admin renames anytime.
  site_name: process.env.NEXT_PUBLIC_APP_NAME || VERTICAL.defaults.siteName,
  site_tagline: VERTICAL.defaults.tagline,
  default_currency: "PKR",
  currency_symbol: "Rs",
  default_country: "Pakistan",
  default_city: "Lahore",
  hero_title: VERTICAL.defaults.heroTitle,
  hero_subtitle: VERTICAL.defaults.heroSubtitle,
  search_placeholder: VERTICAL.defaults.searchPlaceholder,
  // The site's event countdown on the home page (bakra mandi: Eid ul Adha); empty = none.
  event_name: VERTICAL.event?.name || "",
  event_date: VERTICAL.event?.date || "",
  event_note: VERTICAL.event?.note || "",
  // Contact details are the owner's — set in Admin → Settings (first-run setup asks).
  contact_email: "",
  contact_phone: "",
  whatsapp_number: "",
  listing_expiry_days: "30",
  expired_reactivation_days: "30",
  default_free_ad_quota: "1", // live ads at a time without a plan (lib/plan)
  // Branding & appearance (Admin → Branding & Appearance)
  site_logo: "",
  logo_height_mobile: "30",
  logo_height_desktop: "36",
  footer_logo: "",
  footer_logo_height: "36",
  site_favicon: "",
  brand_color: VERTICAL.defaults.brandColor,
  og_image: "",
  // Footer & social
  footer_about: "",
  footer_copyright: "",
  social_facebook: "",
  social_instagram: "",
  social_youtube: "",
  social_tiktok: "",
  social_x: "",
  // Posting
  max_photos_per_ad: "12",
  // Code & tracking — pasted into every page (Search Console, Analytics, Pixel…)
  head_code: "",
  body_code: "",
};

/**
 * Returns the full settings map (DB values overlaid on defaults).
 * Never throws — falls back to defaults if the DB is unavailable.
 */
/**
 * Settings change only from the admin panel, so the read is cached across
 * requests (not just within one render) and busted explicitly on save.
 * React `cache` still dedupes the repeat calls inside a single render pass.
 */
const loadSettings = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      await dbConnect();
      const docs = await Setting.find({}).lean();
      const map: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const d of docs as any[]) {
        if (d?.key) map[d.key] = d.value;
      }
      return map;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },
  ["settings-map"],
  { tags: [SETTINGS_TAG], revalidate: 3600 }
);

export const getSettings = cache(async (): Promise<Record<string, string>> => loadSettings());

/** Call after any admin settings write so the next request sees fresh values. */
export function invalidateSettings() {
  // Immediate expiry: an admin who just saved expects to see the change.
  revalidateTag(SETTINGS_TAG, { expire: 0 });
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const s = await getSettings();
  return s[key] ?? fallback;
}
