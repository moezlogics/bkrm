/**
 * Branding from the admin settings (Admin → Branding & Appearance):
 * logo + its display size in the header/footer, favicon, brand colour.
 * Pure function of the settings map, safe on server and client.
 */
export type Branding = {
  logo: string;               // header logo image ("" = text logo)
  logoHeight: number;         // px, phones
  logoHeightDesktop: number;  // px, ≥ 1024px
  footerLogo: string;         // "" = same as header logo
  footerLogoHeight: number;   // px
  favicon: string;
  primary: string;            // "#rrggbb" or ""
  logoText: string;           // text logo fallback
};

const px = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(96, Math.max(16, Math.round(n))) : def;
};
const hex = (v?: string) => (v && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : "");

export function getBranding(s: Record<string, string | undefined>): Branding {
  return {
    logo: s.site_logo || "",
    logoHeight: px(s.logo_height_mobile, 30),
    logoHeightDesktop: px(s.logo_height_desktop, 36),
    footerLogo: s.footer_logo || "",
    footerLogoHeight: px(s.footer_logo_height, 36),
    favicon: s.site_favicon || "",
    primary: hex(s.brand_color),
    logoText: s.site_name || process.env.NEXT_PUBLIC_APP_NAME || "Classifieds",
  };
}

/** CSS variables for <html>: logo sizes + brand colour (shades derived). */
export function brandStyle(b: Branding): Record<string, string> {
  const vars: Record<string, string> = {
    "--logo-h": `${b.logoHeight}px`,
    "--logo-h-lg": `${b.logoHeightDesktop}px`,
    "--footer-logo-h": `${b.footerLogoHeight}px`,
  };
  if (b.primary) {
    vars["--primary"] = b.primary;
    vars["--primary-light"] = `color-mix(in srgb, ${b.primary} 82%, white)`;
    vars["--primary-dark"] = `color-mix(in srgb, ${b.primary} 80%, black)`;
  }
  return vars;
}
