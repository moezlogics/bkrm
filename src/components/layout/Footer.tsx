import React from "react";
import Link from "next/link";
import { Mail, Phone, MapPin } from "lucide-react";
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/mongodb";
import CmsPage from "@/models/CmsPage";
import { getSettings } from "@/lib/settings";
import { getVisitorLocation } from "@/lib/visitor-location";
import { getCatalog } from "@/lib/catalog";
import { getBranding } from "@/lib/branding";
import { VERTICAL } from "@/vertical";

// Brand-mark paths (lucide no longer ships brand icons).
const SOCIAL: { key: string; label: string; d: string }[] = [
  { key: "social_facebook", label: "Facebook", d: "M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21h2.9z" },
  { key: "social_instagram", label: "Instagram", d: "M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM12 3.6c2.7 0 3 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-2.7-.1-4-1.4-4.1-4.1-.1-1.1-.1-1.4-.1-4.1s0-3 .1-4.1c.1-2.7 1.4-4 4.1-4.1 1.1-.1 1.4-.1 4.1-.1z" },
  { key: "social_youtube", label: "YouTube", d: "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" },
  { key: "social_tiktok", label: "TikTok", d: "M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" },
  { key: "social_x", label: "X", d: "M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" },
];

// Footer links change only when an admin edits CMS pages — cached, not
// re-queried on every page view (the footer renders on every route).
const getFooterPages = unstable_cache(
  async () => {
    await dbConnect();
    const pages = await CmsPage.find({ status: true, showInFooter: true }).sort({ sequence: 1 }).select("title slug").lean();
    return JSON.parse(JSON.stringify(pages));
  },
  ["footer-pages"],
  { tags: ["cms"], revalidate: 3600 }
);

async function getFooterData() {
  try {
    const [catalog, pages] = await Promise.all([getCatalog(), getFooterPages()]);
    return { categories: catalog.topCategories().slice(0, 6), pages };
  } catch {
    return { categories: [], pages: [] };
  }
}

export async function Footer() {
  const [settings, { pages }, loc] = await Promise.all([getSettings(), getFooterData(), getVisitorLocation()]);
  const legal = pages.filter((p: any) => ["privacy-policy", "terms-of-service"].includes(p.slug));
  const socials = SOCIAL.filter((x) => /^https?:\/\//.test(settings[x.key] || ""));
  const year = new Date().getFullYear();
  const copyright = (settings.footer_copyright || "").replace(/\{year\}/g, String(year)).trim()
    || `© ${year} ${settings.site_name}. All rights reserved.`;

  return (
    <footer className="bg-card border-t border-card-border/80 mt-auto pt-8 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Top minimal row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-card-border/60">
          <div>
            <Link href="/" className="inline-block text-lg font-extrabold text-content tracking-tight hover:text-primary transition-colors">
              {settings.site_name}
            </Link>
            <p className="text-xs text-content-tertiary mt-1">
              {settings.site_tagline || VERTICAL.defaults.tagline}
            </p>
          </div>

          {/* Quick minimal nav pills/links */}
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-content-secondary">
            <Link href="/ads" className="hover:text-primary transition-colors">Browse Ads</Link>
            <Link href="/ads/post" className="hover:text-primary transition-colors">{VERTICAL.copy.sellCta}</Link>
            {pages.map((p: any) => (
              <Link key={p.slug} href={`/page/${p.slug}`} className="hover:text-primary transition-colors">{p.title}</Link>
            ))}
            {settings.contact_email && (
              <a href={`mailto:${settings.contact_email}`} className="hover:text-primary transition-colors">Help & Support</a>
            )}
          </nav>
        </div>

        {/* Bottom minimal info & copyright */}
        <div className="pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-content-tertiary">
          <p>{copyright}</p>

          {/* Socials minimal */}
          {socials.length > 0 && (
            <div className="flex items-center gap-2">
              {socials.map((x) => (
                <a
                  key={x.key}
                  href={settings[x.key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={x.label}
                  className="grid place-items-center h-7 w-7 rounded-full bg-surface-secondary hover:bg-surface-tertiary text-content-secondary hover:text-primary transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d={x.d} /></svg>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
