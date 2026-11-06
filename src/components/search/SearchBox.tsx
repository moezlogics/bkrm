"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Clock, X, LayoutGrid, ArrowUpRight, Loader2, TrendingUp } from "lucide-react";
import { VERTICAL } from "@/vertical";

type Cat = { name: string; href: string; context: string; n: number };
type Ad = { title: string; href: string; price: string; image: string | null; city: string };
type Resp = { q: string; categories: Cat[]; ads: Ad[]; popular?: { name: string; path: string; n: number; context: string }[] };
type Row = { key: string; href: string; kind: "recent" | "popular" | "category" | "ad" | "all"; label: string; sub?: string; image?: string | null; n?: number; query?: string };

const RECENT_KEY = "recent-searches";
const cache = new Map<string, Resp>();
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
const saveRecent = (q: string) => {
  try {
    const v = q.trim(); if (!v) return;
    const list = [v, ...readRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
};

/** Bold the parts of `text` that start with one of the typed words. */
function Highlight({ text, q }: { text: string; q: string }) {
  const toks = q.toLowerCase().split(/\s+/).filter((t) => t.length > 0).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!toks.length) return <>{text}</>;
  const rx = new RegExp(`(^|[^a-z0-9])(${toks.join("|")})`, "ig");
  const out: React.ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = rx.exec(text))) {
    const start = m.index + m[1].length;
    out.push(text.slice(last, start), <b key={i++} className="font-semibold text-content">{m[2] && text.slice(start, start + m[2].length)}</b>);
    last = start + m[2].length;
    if (rx.lastIndex === m.index) rx.lastIndex++;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * Search box with live suggestions. Brands/models/sections open their archive
 * directly; Enter runs a full, ranked, all-Pakistan search (/search), which
 * itself jumps to an archive when the words name exactly one of ours.
 */
export function SearchBox({
  variant, placeholder = VERTICAL.copy.searchHint || `Search ${VERTICAL.noun.many}, ${VERTICAL.brandWord.many} and models`, defaultValue = "", leading, className = "",
}: {
  variant: "desktop" | "mobile" | "hero";
  placeholder?: string;
  defaultValue?: string;
  leading?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQ(defaultValue), [defaultValue]);

  // Fetch suggestions (debounced, cancellable, cached per query).
  useEffect(() => {
    if (!open) return;
    const key = q.trim().toLowerCase();
    if (cache.has(key)) { setData(cache.get(key)!); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(key)}`, { signal: ctrl.signal });
        const j: Resp = await r.json();
        cache.set(key, j);
        setData(j);
      } catch { /* aborted or offline */ }
      finally { setLoading(false); }
    }, key ? 120 : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open]);

  // Close when tapping outside.
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const rows: Row[] = useMemo(() => {
    const text = q.trim();
    if (!text) {
      return [
        ...recent.map((r) => ({ key: `r:${r}`, href: `/search?q=${encodeURIComponent(r)}`, kind: "recent" as const, label: r, query: r })),
        ...(data?.popular || []).map((p) => ({ key: `p:${p.path}`, href: `/${p.path}`, kind: "popular" as const, label: p.name, sub: p.context, n: p.n })),
      ];
    }
    const d = data && data.q.trim().toLowerCase() === text.toLowerCase() ? data : null;
    return [
      ...(d?.categories || []).map((c) => ({ key: `c:${c.href}`, href: c.href, kind: "category" as const, label: c.name, sub: c.context, n: c.n })),
      ...(d?.ads || []).map((a) => ({ key: `a:${a.href}`, href: a.href, kind: "ad" as const, label: a.title, sub: `${a.price}${a.city ? ` · ${a.city}` : ""}`, image: a.image })),
      { key: "all", href: `/search?q=${encodeURIComponent(text)}&all=1`, kind: "all" as const, label: `See all results for “${text}”`, query: text },
    ];
  }, [q, data, recent]);

  const go = useCallback((row: Row | null) => {
    const text = q.trim();
    setOpen(false);
    inputRef.current?.blur();
    if (!row) {
      if (!text) return;
      saveRecent(text);
      router.push(`/search?q=${encodeURIComponent(text)}`);
      return;
    }
    if (row.query) saveRecent(row.query); else if (text) saveRecent(text);
    router.push(row.href);
  }, [q, router]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };

  const clearRecent = () => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecent([]); };

  const frame = {
    desktop: "h-10.5 rounded-none border border-slate-300 bg-white hover:border-slate-400 focus-within:bg-white focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
    mobile: "h-10 rounded-none bg-slate-50 border border-slate-300 focus-within:bg-white focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
    hero: "h-11 sm:h-12 rounded-none border border-slate-300 bg-surface focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
  }[variant];

  const showList = open && rows.length > 0;
  let lastKind = "";

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form
        role="search"
        action="/search"
        method="get"
        onSubmit={(e) => { e.preventDefault(); go(active >= 0 ? rows[active] : null); }}
        className={`flex items-center w-full transition-all ${frame}`}
      >
        {leading}
        <div className={`flex items-center gap-2 flex-1 min-w-0 h-full ${variant === "mobile" ? "px-3" : "px-3.5"}`}>
          {loading ? <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" /> : <Search className={`h-4 w-4 shrink-0 ${variant === "hero" ? "text-primary" : "text-slate-400"}`} />}
          <input
            ref={inputRef}
            name="q"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
            onFocus={() => { setRecent(readRecent()); setOpen(true); }}
            onKeyDown={onKey}
            placeholder={placeholder}
            aria-label="Search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            enterKeyHint="search"
            className="w-full min-w-0 h-full bg-transparent outline-none text-[13.5px] sm:text-sm text-slate-900 placeholder:text-slate-400"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} className="grid place-items-center h-6 w-6 rounded-full text-slate-400 hover:text-slate-600" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {variant !== "mobile" && (
          <button type="submit" className={`shrink-0 bg-primary hover:bg-primary-dark text-white text-xs sm:text-sm font-semibold rounded-none active:scale-95 transition-all ${variant === "hero" ? "h-full px-5 sm:px-7" : "h-8.5 mr-1 px-4 sm:px-5"}`}>
            Search
          </button>
        )}
      </form>

      {showList && (
        <div id={listId} role="listbox" className="absolute left-0 right-0 top-full mt-1 z-50 rounded-none border border-slate-200 bg-card shadow-xl overflow-hidden max-h-[70vh] overflow-y-auto">
          {rows.map((row, i) => {
            const header = row.kind !== lastKind && row.kind !== "all"
              ? { recent: "Recent searches", popular: "Popular", category: "Brands & categories", ad: "Ads" }[row.kind]
              : null;
            lastKind = row.kind;
            return (
              <React.Fragment key={row.key}>
                {header && (
                  <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">{header}</span>
                    {row.kind === "recent" && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={clearRecent} className="text-[11px] font-semibold text-content-tertiary hover:text-primary">Clear</button>}
                  </div>
                )}
                <a
                  href={row.href}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => { e.preventDefault(); go(row); }}
                  className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${i === active ? "bg-surface-secondary" : ""} ${row.kind === "all" ? "border-t border-slate-100 text-primary font-semibold" : "text-content-secondary"}`}
                >
                  {row.kind === "ad" ? (
                    <span className="h-10 w-10 rounded-md bg-surface-secondary overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {row.image && <img src={row.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </span>
                  ) : (
                    <span className="grid place-items-center h-8 w-8 rounded-full bg-surface-secondary text-content-tertiary shrink-0">
                      {row.kind === "recent" ? <Clock className="h-4 w-4" /> : row.kind === "popular" ? <TrendingUp className="h-4 w-4" /> : row.kind === "all" ? <Search className="h-4 w-4 text-primary" /> : <LayoutGrid className="h-4 w-4 text-primary" />}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{row.kind === "category" || row.kind === "ad" ? <Highlight text={row.label} q={q} /> : row.label}</span>
                    {row.sub && <span className="block text-[11px] text-content-tertiary truncate">{row.sub}</span>}
                  </span>
                  {typeof row.n === "number" && row.n > 0 && <span className="text-[11px] text-content-tertiary shrink-0">{row.n.toLocaleString()} {row.n === 1 ? "ad" : "ads"}</span>}
                  {row.kind === "category" && <ArrowUpRight className="h-4 w-4 text-content-tertiary shrink-0" />}
                </a>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
