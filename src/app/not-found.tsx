import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Home, LayoutGrid, PlusCircle, LifeBuoy, ChevronRight } from "lucide-react";
import { SearchBox } from "@/components/search/SearchBox";
import { getCatalog } from "@/lib/catalog";
import { getVisitorLocation, toClientLocation } from "@/lib/visitor-location";
import { OfflineHint } from "@/components/OfflineHint";
import { VERTICAL } from "@/vertical";

/**
 * The 404 page (unknown URLs and notFound() calls). Served with a real 404
 * status and noindex — never a redirect to the homepage, which Search
 * Console reports as a "soft 404". Helps people carry on: search, the main
 * sections and popular categories in their location.
 */
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default async function NotFound() {
  const [catalog, loc] = await Promise.all([
    getCatalog().catch(() => null),
    getVisitorLocation().then(toClientLocation).catch(() => null),
  ]);
  const prefix = loc?.prefix || "";
  const cats = (catalog?.topCategories() ?? []).slice(0, 8);

  const links = [
    { href: "/", label: "Homepage", sub: "Latest ads near you", icon: Home },
    { href: prefix || "/ads", label: "Browse all ads", sub: loc?.city ? `Everything in ${loc.label}` : "Across Pakistan", icon: LayoutGrid },
    { href: "/ads/post", label: VERTICAL.copy.sellCta, sub: "Post an ad in minutes", icon: PlusCircle },
    { href: "/faq", label: "Help & FAQ", sub: "Answers to common questions", icon: LifeBuoy },
  ];

  return (
    <div className="wrap py-10 sm:py-16 pb-mobile-nav">
      <div className="mx-auto max-w-2xl text-center">
        <p aria-hidden className="text-[88px] sm:text-[120px] font-extrabold leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-primary to-primary/40 select-none">404</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-content">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm sm:text-base text-content-secondary">
          The link may be mistyped or out of date — or the ad was sold or removed. Try a search, or pick up from one of these.
        </p>

        <OfflineHint />

        <div className="mt-6 text-left">
          <SearchBox variant="hero" placeholder={`Search ${VERTICAL.noun.many}, ${VERTICAL.brandWord.many} or models`} />
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 sm:grid-cols-2 gap-2.5">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="group flex items-center gap-3 rounded-xl border border-card-border bg-card p-3.5 hover:border-primary/50 hover:shadow-sm transition">
            <span className="grid place-items-center h-10 w-10 rounded-lg bg-primary/10 text-primary shrink-0"><l.icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-content">{l.label}</span>
              <span className="block text-xs text-content-tertiary truncate">{l.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-content-tertiary group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ))}
      </div>

      {cats.length > 0 && (
        <div className="mx-auto mt-8 max-w-3xl">
          <h2 className="text-sm font-bold text-content mb-2.5">Popular categories{loc?.city ? ` in ${loc.label}` : ""}</h2>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <Link key={c.slug} href={`${prefix}/${c.path}`} className="rounded-full border border-card-border bg-card px-3.5 py-1.5 text-[13px] font-medium text-content-secondary hover:border-primary hover:text-primary transition-colors">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
