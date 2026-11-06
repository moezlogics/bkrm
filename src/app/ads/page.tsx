"use client";

import React, { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ads as adsApi, categories as categoriesApi } from "@/lib/api-client";
import { Search, MapPin, SlidersHorizontal, X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ListingCard } from "@/components/ListingCard";
import { VERTICAL } from "@/vertical";

const CONDITIONS = [
  { v: "used", l: "Used" }, { v: "new", l: "New" }, { v: "for-parts", l: "For Parts" },
];

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [categories, setCategories] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  const [searchInput, setSearchInput] = useState(searchParams.get("search") || searchParams.get("q") || "");
  const [cityInput, setCityInput] = useState(searchParams.get("city") || "");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");
  const [condition, setCondition] = useState(searchParams.get("condition") || "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "newest");
  const [selectedCategoryId, setSelectedCategoryId] = useState(searchParams.get("categoryId") || "");
  const [cfFilters, setCfFilters] = useState<Record<string, string>>({});

  // Lock body scroll when mobile filter sheet is open
  useEffect(() => {
    if (mobileFiltersOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileFiltersOpen]);

  useEffect(() => {
    categoriesApi.list().then((res) => { if (res.success) setCategories(res.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) { setCustomFields([]); return; }
    fetch(`/api/custom-fields?categoryId=${selectedCategoryId}`).then((r) => r.json()).then((d) => { if (d.success) setCustomFields(d.data.filter((f: any) => f.filterable)); }).catch(() => {});
  }, [selectedCategoryId]);

  useEffect(() => {
    setSearchInput(searchParams.get("search") || searchParams.get("q") || "");
    setCityInput(searchParams.get("city") || "");
    setMinPrice(searchParams.get("minPrice") || "");
    setMaxPrice(searchParams.get("maxPrice") || "");
    setCondition(searchParams.get("condition") || "");
    setSortBy(searchParams.get("sortBy") || "newest");
    setSelectedCategoryId(searchParams.get("categoryId") || "");
    setPage(1);
    const cf: Record<string, string> = {};
    searchParams.forEach((value, key) => { if (key.startsWith("cf_")) cf[key.substring(3)] = value; });
    setCfFilters(cf);
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    const queryParams: Record<string, string> = {};
    searchParams.forEach((val, key) => { if (key !== "page") queryParams[key] = val; });
    if (!queryParams.search && queryParams.q) {
      queryParams.search = queryParams.q;
    }
    queryParams.status = "active";
    queryParams.page = "1";
    adsApi.list(queryParams).then((res) => {
      if (res.success) {
        setListings(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
        setPage(1);
      }
    }).catch(() => toast.error("Failed to load listings")).finally(() => setLoading(false));
  }, [searchParams, toast]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const queryParams: Record<string, string> = {};
    searchParams.forEach((val, key) => { if (key !== "page") queryParams[key] = val; });
    if (!queryParams.search && queryParams.q) queryParams.search = queryParams.q;
    queryParams.status = "active";
    queryParams.page = String(nextPage);

    try {
      const res = await adsApi.list(queryParams);
      if (res.success) {
        setListings((prev) => [...prev, ...res.data.data]);
        setPage(nextPage);
      }
    } catch {
      toast.error("Failed to load more listings");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, totalPages, searchParams, toast]);

  useEffect(() => {
    const el = observerTarget.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        loadMore();
      }
    }, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (searchInput) params.set("search", searchInput);
    if (cityInput) params.set("city", cityInput);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (condition) params.set("condition", condition);
    if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
    if (sortBy && sortBy !== "newest") params.set("sortBy", sortBy);
    Object.entries(cfFilters).forEach(([k, v]) => { if (v) params.set(`cf_${k}`, v); });
    router.push(`/ads?${params.toString()}`);
    setMobileFiltersOpen(false);
  };

  const clearFilters = () => {
    setSearchInput(""); setCityInput(""); setMinPrice(""); setMaxPrice(""); setCondition(""); setSelectedCategoryId(""); setCfFilters({});
    router.push("/ads"); setMobileFiltersOpen(false);
  };

  const topCats = categories.filter((c: any) => !c.parentCategoryId);
  const heading = searchInput ? `“${searchInput}”` : cityInput ? `Ads in ${cityInput}` : "All listings";

  // NOTE: this is a plain JSX value, not a nested component. Declaring
  // `const Filters = () => (...)` inside the render created a NEW component
  // type on every keystroke, so React unmounted/remounted the whole panel and
  // the focused input lost focus after every character typed.
  const filtersContent = (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-content-secondary">Keyword</label>
        <div className="flex items-center gap-2 h-10 rounded-lg border border-card-border px-3 bg-surface"><Search className="h-4 w-4 text-content-tertiary" /><input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={VERTICAL.defaults.searchPlaceholder} className="bg-transparent outline-none w-full text-sm" /></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-content-secondary">City</label>
        <div className="flex items-center gap-2 h-10 rounded-lg border border-card-border px-3 bg-surface"><MapPin className="h-4 w-4 text-content-tertiary" /><input value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="e.g. Lahore" className="bg-transparent outline-none w-full text-sm" /></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-content-secondary">Category</label>
        <div className="flex flex-wrap gap-1.5">
          {topCats.map((cat: any) => (
            <button key={cat._id} onClick={() => { setSelectedCategoryId(cat._id === selectedCategoryId ? "" : cat._id); setCfFilters({}); }} className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${selectedCategoryId === cat._id ? "bg-primary text-white border-primary shadow-xs" : "border-card-border text-content-secondary hover:border-primary"}`}>{cat.name}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-content-secondary">Price (Rs)</label>
        <div className="flex items-center gap-2">
          <input type="number" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="h-10 rounded-md border border-card-border px-3 w-full outline-none text-sm bg-surface" />
          <span className="text-content-tertiary">–</span>
          <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="h-10 rounded-md border border-card-border px-3 w-full outline-none text-sm bg-surface" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-content-secondary">Condition</label>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((c) => (
            <button key={c.v} onClick={() => setCondition(condition === c.v ? "" : c.v)} className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${condition === c.v ? "bg-primary text-white border-primary shadow-xs" : "border-card-border text-content-secondary hover:border-primary"}`}>{c.l}</button>
          ))}
        </div>
      </div>
      {customFields.map((f: any) => (
        <div key={f._id} className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-content-secondary">{f.name}{f.unit ? ` (${f.unit})` : ""}</label>
          {["dropdown", "radio", "multiselect", "checkbox"].includes(f.type) ? (
            <select value={cfFilters[f.slug] || ""} onChange={(e) => setCfFilters((p) => ({ ...p, [f.slug]: e.target.value }))} className="h-10 rounded-md border border-card-border px-3 outline-none text-sm bg-surface">
              <option value="">Any {f.name.toLowerCase()}</option>
              {f.values.map((v: string) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : ["number", "decimal", "year", "range"].includes(f.type) ? (
            // Ranges: model year 2015–2020, mileage up to 50,000 km…
            <div className="flex items-center gap-2">
              <input type="number" inputMode="numeric" min={f.min ?? undefined} max={f.max ?? undefined} value={cfFilters[`${f.slug}_min`] || ""} onChange={(e) => setCfFilters((p) => ({ ...p, [`${f.slug}_min`]: e.target.value }))} placeholder="From" className="h-10 rounded-md border border-card-border px-3 w-full outline-none text-sm bg-surface" />
              <span className="text-content-tertiary">–</span>
              <input type="number" inputMode="numeric" min={f.min ?? undefined} max={f.max ?? undefined} value={cfFilters[`${f.slug}_max`] || ""} onChange={(e) => setCfFilters((p) => ({ ...p, [`${f.slug}_max`]: e.target.value }))} placeholder="To" className="h-10 rounded-md border border-card-border px-3 w-full outline-none text-sm bg-surface" />
            </div>
          ) : (
            <input value={cfFilters[f.slug] || ""} onChange={(e) => setCfFilters((p) => ({ ...p, [f.slug]: e.target.value }))} placeholder={f.name} className="h-10 rounded-md border border-card-border px-3 outline-none text-sm bg-surface" />
          )}
        </div>
      ))}
      <div className="flex gap-2.5 pt-3 border-t border-card-border mt-2 sticky bottom-0 bg-card py-2">
        <button onClick={clearFilters} className="flex-1 h-10 rounded-md border border-card-border text-xs sm:text-sm font-semibold text-content-secondary hover:bg-surface-secondary active:scale-98 transition-all">Clear All</button>
        <button onClick={() => applyFilters()} className="flex-1 h-10 rounded-md bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-semibold shadow-sm active:scale-98 transition-all">Apply Filters</button>
      </div>
    </div>
  );

  return (
    <div className="wrap py-4 pb-mobile-nav">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-content truncate">{heading}</h1>
          <p className="text-xs text-content-secondary">{total.toLocaleString("en-PK")} {total === 1 ? "listing" : "listings"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden flex items-center gap-1.5 border-2 border-primary/25 bg-primary/10 hover:bg-primary/15 text-primary px-3 h-9.5 rounded-xl text-xs sm:text-sm font-semibold active:scale-95 transition-all shadow-xs"
          >
            <SlidersHorizontal className="h-4 w-4 text-primary stroke-[2.5]" />
            <span>Filters</span>
          </button>
          <select
            value={sortBy}
            onChange={(e) => { const params = new URLSearchParams(searchParams.toString()); if (e.target.value === "newest") params.delete("sortBy"); else params.set("sortBy", e.target.value); router.push(`/ads?${params.toString()}`); }}
            className="text-xs sm:text-sm font-medium text-content-secondary bg-surface border border-card-border rounded-xl px-3 h-9.5 outline-none shadow-xs"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
          </select>
        </div>
      </div>

      <div className="flex gap-5 items-start">
        <aside className="hidden lg:block w-64 shrink-0 rounded-lg sm:rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] p-5 sticky top-[calc(var(--header-height)+12px)] max-h-[calc(100vh-var(--header-height)-24px)] overflow-y-auto shadow-xs">
          {filtersContent}
        </aside>

        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : listings.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
                {listings.map((ad: any) => <ListingCard key={ad._id} ad={ad} />)}
              </div>
              {page < totalPages && (
                <div ref={observerTarget} className="flex flex-col items-center justify-center py-8 gap-2">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 px-6 h-10 rounded-lg border border-black/15 bg-white text-sm font-semibold hover:border-black transition-all disabled:opacity-50 shadow-xs active:scale-95"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Loading more ads...
                      </>
                    ) : (
                      "Load more ads"
                    )}
                  </button>
                  <span className="text-xs text-content-secondary">
                    Showing {listings.length} of {total} ads
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg sm:rounded-xl border border-dashed border-card-border bg-surface-secondary p-14 text-center flex flex-col items-center gap-3">
              <Search className="h-10 w-10 text-content-tertiary" />
              <h3 className="font-semibold text-content text-base sm:text-lg">No listings found</h3>
              <p className="text-sm text-content-secondary max-w-sm">Try adjusting or clearing your filters.</p>
              <button onClick={clearFilters} className="bg-primary hover:bg-primary-dark text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-lg shadow-sm active:scale-95 transition-all">Reset all filters</button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Sheet Drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileFiltersOpen(false)} />
          <div className="w-full sm:max-w-md max-h-[85vh] bg-surface rounded-t-2xl sm:rounded-xl z-10 flex flex-col shadow-2xl relative animate-slide-up">
            <div className="w-12 h-1.5 bg-card-border rounded-full mx-auto mt-2.5 sm:hidden" />
            <div className="p-4 border-b border-card-border flex items-center justify-between">
              <h3 className="font-bold text-content text-base">Filters</h3>
              <button onClick={() => setMobileFiltersOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-secondary text-content-secondary"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{filtersContent}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="wrap py-16 text-center"><Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" /></div>}>
      <SearchPageContent />
    </Suspense>
  );
}
