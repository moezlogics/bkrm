import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileNav } from "@/components/layout/MobileNav";
import { ToastProvider } from "@/components/ui/Toast";
import { ScrollToTop } from "@/components/ScrollToTop";
import { NavProgress } from "@/components/NavProgress";
import { PushPrompt } from "@/components/push/PushPrompt";
import { NetworkStatus } from "@/components/NetworkStatus";
import { CardIconSprite } from "@/components/ui/CardIcons";
import { SiteChromeOnly, MainArea } from "@/components/layout/AppChrome";
import { getBranding, brandStyle } from "@/lib/branding";
import { getVisitorLocation, toClientLocation, getPlacesMap } from "@/lib/visitor-location";
import { HeadCode, BodyCode } from "@/lib/head-code";

// Inter as one variable font file: every weight (400–900) from a single
// download, built for screens and very legible at small sizes.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  fallback: ["system-ui", "Segoe UI", "Roboto", "sans-serif"],
  adjustFontFallback: true,
});

import { getSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const base = getBaseUrl();
  const brand = getBranding(s);
  return {
    metadataBase: new URL(base),
    // The admin's favicon, else /brand-icon (logo or a generated brand icon).
    icons: { icon: brand.favicon || withBasePath("/brand-icon"), apple: brand.favicon || withBasePath("/brand-icon") },
    title: {
      default: `${s.site_name} — ${s.site_tagline}`,
      template: "%s",
    },
    description: s.site_tagline,
    keywords: VERTICAL.defaults.metaKeywords,
    openGraph: {
      type: "website",
      locale: "en_PK",
      siteName: s.site_name,
      url: base,
      ...(s.og_image ? { images: [{ url: s.og_image }] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

import { SessionProvider } from "next-auth/react";
import { getCatalog } from "@/lib/catalog";
import { BASE_PATH_SHIM, withBasePath } from "@/lib/base-path";
import { VERTICAL } from "@/vertical";
import { getSectionCovers } from "@/lib/section-covers";

// Header category strip: from the cached catalog (no per-request query).
// Only the four fields the client header needs cross the wire.
async function getShellCategories() {
  const catalog = await getCatalog();
  return catalog.topCategories().map((c) => ({ name: c.name, slug: c.slug, path: c.path, icon: c.icon ?? null }));
}

async function getShellData() {
  try {
    const [settings, cats, covers] = await Promise.all([getSettings(), getShellCategories(), getSectionCovers()]);
    return {
      siteName: settings.site_name || process.env.NEXT_PUBLIC_APP_NAME || "Classifieds", categories: cats, brand: getBranding(settings),
      headCode: settings.head_code || "", bodyCode: settings.body_code || "", covers,
    };
  } catch {
    return { siteName: process.env.NEXT_PUBLIC_APP_NAME || "Classifieds", categories: [], brand: getBranding({}), headCode: "", bodyCode: "", covers: {} };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The visitor's location is read here (from cookies) so every page — header
  // links, search, bottom nav, footer — is scoped to it on the first paint.
  const [{ siteName, categories, brand, headCode, bodyCode, covers }, visitorLoc, places] = await Promise.all([
    getShellData(), getVisitorLocation(), getPlacesMap().catch(() => ({})),
  ]);
  const location = toClientLocation(visitorLoc);
  return (
    <html lang="en" className={`${inter.variable} h-full`} style={brandStyle(brand)} data-scroll-behavior="smooth" suppressHydrationWarning>
      {/* Admin → Settings → Code & tracking (Search Console, Analytics, Pixel…) */}
      <head>
        <HeadCode html={headCode} />
      </head>
      <body className="min-h-full flex flex-col bg-surface-secondary text-content antialiased has-app-nav" suppressHydrationWarning>
        {/* Under a sub-URL, same-site fetch("/api/...") calls must go to this app, not the main site. */}
        {BASE_PATH_SHIM && <script dangerouslySetInnerHTML={{ __html: BASE_PATH_SHIM }} />}
        <BodyCode html={bodyCode} />
        <CardIconSprite />
        <SessionProvider basePath={withBasePath("/api/auth")}>
          <ToastProvider>
            <ScrollToTop />
            <NavProgress />
            <SiteChromeOnly>
              <Header siteName={siteName} brand={brand} categories={categories} covers={covers} location={location} places={places} />
            </SiteChromeOnly>
            <MainArea>{children}</MainArea>
            <PushPrompt />
            <NetworkStatus />
            <SiteChromeOnly>
              <Footer />
              <MobileNav browseHref={location.prefix || "/ads"} />
            </SiteChromeOnly>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
