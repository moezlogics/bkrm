import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search as SearchIcon, MapPin, Navigation, SlidersHorizontal, Sparkles } from "lucide-react";
import { ListingCard } from "@/components/ListingCard";
import { InfiniteListingFeed } from "@/components/listing/InfiniteListingFeed";
import { loadMoreSearchListingsAction } from "@/app/actions/listings";
import { IntentLink } from "@/components/IntentLink";
import { getCatalog } from "@/lib/catalog";
import { getVisitorLocation } from "@/lib/visitor-location";
import {
  parseQuery, searchListings, didYouMean, categoryCounts, SEARCH_SORTS, type SearchSort,
} from "@/lib/search";

/**
 * /search?q=…  — ranked, all-Pakistan search.
 * Params: sort (relevance|nearest|newest|price_low|price_high), loc ("all" |
 * "<city>" | "<city>/<area>"), cat (category id), cond (new|used), page,
 * all=1 (show results even when the words name one of our categories).
 */
const PAGE_SIZE = 24;
type SP = { q?: string; sort?: string; loc?: string; cat?: string; cond?: string; page?: string; all?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `${q} — search results` : "Search ads",
    robots: { index: false, follow: true }, // search result pages stay out of Google
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, visitor, catalog, counts] = await Promise.all([searchParams, getVisitorLocation(), getCatalog(), categoryCounts()]);
  const raw = (sp.q || "").trim().slice(0, 100);
  const parsed = await parseQuery(raw, { visitorCitySlug: visitor.city?.slug, counts });

  // ── Location scope: explicit ?loc wins, else a place named in the query, else anywhere ──
  let city = parsed.city, area = parsed.area;
  if (sp.loc) {
    const [c, a] = sp.loc.split("/");
    city = sp.loc === "all" ? undefined : catalog.city(c);
    area = city && a ? catalog.area(city.slug, a) : undefined;
  }
  const locPrefix = city ? `/${city.slug}${area ? `/${area.slug}` : ""}` : "";

  // ── The words name one of our brands/models/sections → open that archive ──
  if (!sp.all && !sp.cat && !sp.cond && !sp.page) {
    if (parsed.exact) redirect(`${locPrefix}/${parsed.exact.path}`);
    if (!parsed.tokens.length && locPrefix) redirect(locPrefix);
  }

  // ── Distance reference: the visitor, unless they're searching another city ──
  let point: [number, number] | null = null;
  let pointLabel = "";
  if (visitor.point && (!city || city.slug === visitor.city?.slug)) {
    point = visitor.point;
    pointLabel = visitor.precise ? "you" : visitor.area?.name || visitor.city?.name || "you";
  } else {
    const p = area?.latitude != null ? area : city?.latitude != null ? city : null;
    if (p) { point = [Number(p.longitude), Number(p.latitude)]; pointLabel = p.name; }
  }

  const hasText = parsed.tokens.length > 0;
  // Best match for words, else newest (OLX / dubizzle); "Nearest" is one tap away.
  const defaultSort: SearchSort = hasText ? "relevance" : "newest";
  let sort = (SEARCH_SORTS.some((s) => s.id === sp.sort) ? sp.sort : defaultSort) as SearchSort;
  if (sort === "nearest" && !point) sort = "newest";
  if (sort === "relevance" && !hasText) sort = defaultSort;
  const page = Math.min(100, Math.max(1, Number(sp.page) || 1));
  const cat = sp.cat ? catalog.categoryById(sp.cat) : undefined;
  const cond = sp.cond === "new" || sp.cond === "used" ? sp.cond : undefined;

  const res = await searchListings({
    tokens: parsed.tokens, point, sort, page, pageSize: PAGE_SIZE,
    cityId: area ? undefined : city ? String(city._id) : undefined,
    areaId: area ? String(area._id) : undefined,
    categoryId: cat ? String(cat._id) : undefined,
    condition: cond,
  });
  const suggestion = res.total === 0 && raw ? await didYouMean(raw) : null;
  const totalPages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));

  // Category facet: the most useful sections/brands/models for these results.
  const facet = res.categories
    .map((c) => ({ c: catalog.categoryById(c.id), n: c.n }))
    .filter((x): x is { c: NonNullable<typeof x.c>; n: number } => !!x.c)
    .sort((a, b) => b.n - a.n || a.c.path.split("/").length - b.c.path.split("/").length)
    .slice(0, 10);

  // URL builder that keeps the other choices.
  const href = (patch: Partial<Record<keyof SP, string | undefined>>) => {
    const u = new URLSearchParams();
    const next: SP = { q: raw, sort: sort === defaultSort ? undefined : sort, loc: sp.loc, cat: sp.cat, cond: sp.cond, all: "1", ...patch } as SP;
    for (const [k, v] of Object.entries(next)) if (v && k !== "page") u.set(k, v);
    return `/search?${u.toString()}`;
  };
  const scope = area ? `${area.name}, ${city!.name}` : city ? city.name : "all of Pakistan";
  const chip = (on: boolean) =>
    `shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-primary bg-primary text-white" : "border-card-border bg-surface text-content-secondary hover:border-primary hover:text-primary"}`;

  return (
    <div className="wrap py-4 pb-mobile-nav">
      {/* Title */}
      <div className="flex items-end justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-content truncate">{raw ? <>Results for “{raw}”</> : "All ads"}</h1>
          <p className="text-xs sm:text-sm text-content-secondary mt-0.5 flex items-center gap-1 flex-wrap">
            <span>{res.total.toLocaleString("en-PK")}{res.totalCapped ? "+" : ""} {res.total === 1 && !res.totalCapped ? "ad" : "ads"} in {scope}</span>
            {sort === "nearest" && pointLabel && <span className="inline-flex items-center gap-1 text-primary">· <Navigation className="h-3 w-3" /> closest to {pointLabel} first</span>}
            {sort === "relevance" && <span className="text-content-tertiary">· best matches first{point ? `, nearby ones higher` : ""}</span>}
          </p>
        </div>
        <Link href={`/ads?${new URLSearchParams({ ...(raw ? { search: raw } : {}), ...(city ? { city: city.name } : {}) })}`} className="hidden sm:inline-flex items-center gap-1.5 border border-card-border px-3 h-9 rounded-lg text-sm font-semibold bg-surface hover:bg-surface-secondary shrink-0">
          <SlidersHorizontal className="h-4 w-4 text-primary" /> More filters
        </Link>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-content-tertiary shrink-0 mr-1">Sort</span>
        {SEARCH_SORTS.filter((s) => (s.id !== "nearest" || point) && (s.id !== "relevance" || hasText)).map((s) => (
          <IntentLink key={s.id} href={href({ sort: s.id === defaultSort ? undefined : s.id })} className={chip(sort === s.id)}>{s.label}</IntentLink>
        ))}
      </div>

      {/* Location */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-content-tertiary shrink-0 mr-1">Where</span>
        <IntentLink href={href({ loc: "all" })} className={chip(!city)}>Anywhere</IntentLink>
        {visitor.city && (
          <IntentLink href={href({ loc: visitor.city.slug })} className={chip(!!city && city.slug === visitor.city.slug && !area)}>
            <MapPin className="h-3 w-3" /> {visitor.city.name}
          </IntentLink>
        )}
        {visitor.city && visitor.area && (
          <IntentLink href={href({ loc: `${visitor.city.slug}/${visitor.area.slug}` })} className={chip(!!area && area.slug === visitor.area.slug)}>
            {visitor.area.name}
          </IntentLink>
        )}
        {city && city.slug !== visitor.city?.slug && (
          <span className={chip(true)}><MapPin className="h-3 w-3" /> {area ? `${area.name}, ` : ""}{city.name}</span>
        )}
      </div>

      {/* Condition */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-content-tertiary shrink-0 mr-1">Condition</span>
        <IntentLink href={href({ cond: undefined })} className={chip(!cond)}>Any</IntentLink>
        <IntentLink href={href({ cond: "new" })} className={chip(cond === "new")}>New</IntentLink>
        <IntentLink href={href({ cond: "used" })} className={chip(cond === "used")}>Used</IntentLink>
      </div>

      {/* Category facet */}
      {facet.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-content-tertiary shrink-0 mr-1">In</span>
          <IntentLink href={href({ cat: undefined })} className={chip(!cat)}>All</IntentLink>
          {facet.map(({ c, n }) => (
            <IntentLink key={String(c._id)} href={href({ cat: String(c._id) })} className={chip(!!cat && String(cat._id) === String(c._id))}>
              {c.name}{res.categoriesExact && <span className="opacity-70"> ({n})</span>}
            </IntentLink>
          ))}
        </div>
      )}

      {/* Did you mean */}
      {suggestion && (
        <p className="mb-3 text-sm text-content-secondary flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" /> Did you mean{" "}
          <Link href={`/search?q=${encodeURIComponent(suggestion)}`} className="font-semibold text-primary hover:underline">{suggestion}</Link>?
        </p>
      )}

      {/* Results with Parameter-free Infinite Scroll */}
      {res.items.length > 0 ? (
        <InfiniteListingFeed
          initialListings={res.items}
          total={res.total}
          onLoadMore={loadMoreSearchListingsAction.bind(null, {
            q: raw,
            sort,
            loc: sp.loc,
            cat: sp.cat,
            cond,
          })}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-card-border bg-surface-secondary p-10 text-center">
          <SearchIcon className="h-9 w-9 text-content-tertiary mx-auto mb-3" />
          <h2 className="font-semibold text-content">{raw ? `No results for “${raw}”${city ? ` in ${scope}` : ""}` : "No ads match these filters"}</h2>
          <p className="text-sm text-content-secondary mt-1">
            {city ? "Try searching anywhere in Pakistan, or use fewer words." : "Check the spelling or try fewer words."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            {city && <Link href={href({ loc: "all" })} className="rounded-lg bg-primary hover:bg-primary-dark text-white font-medium text-sm px-6 py-2.5">Search all Pakistan</Link>}
            {(cat || cond) && <Link href={href({ cat: undefined, cond: undefined })} className="rounded-lg border border-card-border bg-surface font-medium text-sm px-6 py-2.5 hover:border-primary hover:text-primary">Clear filters</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
