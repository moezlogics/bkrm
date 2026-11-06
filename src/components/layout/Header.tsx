"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { logout } from "@/lib/logout";
import {
  Search, Plus, User as UserIcon, LogOut, Settings,
  ChevronDown, LayoutDashboard, MessageSquare, Heart,
  Menu, X, ChevronRight, MapPin, Bell,
} from "lucide-react";
import { useBadges } from "@/lib/badges-client";
import { usePathname } from "next/navigation";
import { LocationPicker } from "./LocationPicker";
import { SearchBox } from "@/components/search/SearchBox";
import type { ClientLocation, PlacesMap } from "@/lib/visitor-location";
import type { Branding } from "@/lib/branding";
import { VERTICAL } from "@/vertical";

const searchHint = VERTICAL.copy.searchHint || `Search ${VERTICAL.noun.many}, ${VERTICAL.brandWord.many} & models`;

type Cat = { name: string; slug: string; path: string; icon?: string | null };

/**
 * Location comes from the server (cookie-backed), so the header renders the
 * visitor's city on first paint and every link below is already scoped to it.
 */
export function Header({
  siteName = "Classifieds", brand, categories = [], location: saved, places = {},
}: { siteName?: string; brand?: Branding; categories?: Cat[]; location: ClientLocation; places?: PlacesMap }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const badges = useBadges(!!session);

  // On a location-scoped page (/karachi/cars) the page's own location
  // wins, so the header never says "Lahore" above a list of Karachi ads. On any
  // other page it's the visitor's saved location.
  const location: ClientLocation = useMemo(() => {
    const [c, a] = pathname.split("/").filter(Boolean);
    const city = c ? places[c.toLowerCase()] : undefined;
    if (!city) return saved;
    const areaName = a ? city.areas[a.toLowerCase()] : undefined;
    const citySlug = c.toLowerCase();
    const areaSlug = areaName ? a.toLowerCase() : null;
    return {
      ...saved,
      chosen: true,
      city: { name: city.name, slug: citySlug },
      area: areaSlug ? { name: areaName!, slug: areaSlug } : null,
      label: areaName ? `${areaName}, ${city.name}` : city.name,
      prefix: areaSlug ? `/${citySlug}/${areaSlug}` : `/${citySlug}`,
      precise: saved.precise && saved.city?.slug === citySlug,
    };
  }, [pathname, places, saved]);
  // Immersive listing-detail view hides the header on mobile (full-bleed gallery).
  const immersive = pathname.startsWith("/ads/") && pathname !== "/ads/post";

  const [acctOpen, setAcctOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Any navigation closes the mobile drawer.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [menuOpen]);

  // Mobile collapsible header: tucks logo bar on scroll down, pins search bar
  useEffect(() => {
    let lastY = typeof window !== "undefined" ? window.scrollY : 0;
    const onScroll = () => {
      const curY = window.scrollY;
      if (curY > 50 && curY > lastY) {
        setScrolledDown(true);
      } else if (curY < lastY - 6 || curY <= 15) {
        setScrolledDown(false);
      }
      lastY = curY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Every category link follows the visitor's location (OLX behaviour).
  const catHref = (path: string) => `${location.prefix}/${path}`;

  return (
    <header className={`fixed top-0 inset-x-0 z-40 bg-white border-none shadow-none transition-transform duration-300 ease-out ${scrolledDown ? "max-md:-translate-y-14" : "translate-y-0"} ${immersive ? "max-md:hidden" : ""}`}>
      {/* Main Bar */}
      <div className="wrap h-14 md:h-16 flex items-center justify-between gap-3">
        {/* Left: Brand Logo */}
        <Link href="/" prefetch className="shrink-0 flex items-center gap-1 group" aria-label={siteName}>
          {brand?.logo ? (
            // Admin-uploaded logo; its height is set in Branding & Appearance.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt={siteName} className="site-logo max-h-12 md:max-h-14 object-contain" fetchPriority="high" />
          ) : (
            <span className="text-lg md:text-xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
              {siteName.replace(/hub$/i, "")}<span className="text-primary">{/hub$/i.test(siteName) ? "Hub" : ""}</span>
            </span>
          )}
        </Link>

        {/* Desktop search with live suggestions (location picker on its left) */}
        <SearchBox
          variant="desktop"
          className="hidden md:block flex-1 max-w-2xl mx-2"
          leading={<div className="flex items-center px-3.5 h-full border-r border-slate-200 shrink-0"><LocationPicker location={location} /></div>}
        />

        {/* Right Actions */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="md:hidden min-w-0"><LocationPicker location={location} variant="compact" autoDetect /></div>
          {session && <BellLink count={badges.notifications} />}

          {status === "loading" ? (
            <div className="hidden md:block h-9 w-9 rounded-lg bg-slate-100 animate-pulse" />
          ) : session ? (
            <div className="relative hidden md:block">
              <button onClick={() => setAcctOpen((o) => !o)} className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                {session.user?.image ? (
                  <Image src={session.user.image} alt="" width={34} height={34} className="h-8.5 w-8.5 rounded-lg object-cover border border-slate-200" />
                ) : (
                  <div className="h-8.5 w-8.5 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-sm">
                    {session.user?.name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {acctOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAcctOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-xl py-2 z-20 animate-slide-up">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-bold truncate text-slate-900">{session.user?.name}</p>
                      <p className="text-xs text-slate-500 truncate">{session.user?.email}</p>
                    </div>
                    {[
                      { href: "/dashboard", icon: LayoutDashboard, label: "My Dashboard", n: 0 },
                      { href: "/dashboard/notifications", icon: Bell, label: "Notifications", n: badges.notifications },
                      { href: "/dashboard/saved", icon: Heart, label: "Saved ads", n: 0 },
                      { href: "/chat", icon: MessageSquare, label: "Messages", n: badges.chats },
                    ].map((it) => (
                      <Link key={it.label} href={it.href} onClick={() => setAcctOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm font-medium text-slate-700 hover:text-primary hover:bg-slate-50 transition-colors">
                        <it.icon className="h-4 w-4 text-primary" /> <span className="flex-1">{it.label}</span>
                        {it.n > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold grid place-items-center tabular-nums">{it.n > 99 ? "99+" : it.n}</span>}
                      </Link>
                    ))}
                    {(session as any).role === "admin" && (
                      <Link href="/admin" onClick={() => setAcctOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 border-t border-slate-100">
                        <Settings className="h-4 w-4" /> Admin Panel
                      </Link>
                    )}
                    <button onClick={() => { setAcctOpen(false); logout("/"); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 border-t border-slate-100 text-left">
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-slate-800 hover:text-primary transition-colors">
              <UserIcon className="h-4 w-4 text-slate-500" /> Login
            </Link>
          )}
        </div>
      </div>

      {/* Mobile search row with borderless, transparent menu button on the right */}
      <div className="md:hidden wrap pb-2 pt-0.5 flex items-center gap-2">
        <SearchBox variant="mobile" className="flex-1 min-w-0" placeholder={searchHint} />

        {/* Minimal Sharp Menu Button - No background, no border, theme color on icon */}
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
          className="h-10 w-10 shrink-0 grid place-items-center bg-transparent border-0 shadow-none text-primary hover:text-primary-dark rounded-none active:scale-90 transition-transform"
        >
          <Menu className="h-6 w-6 stroke-[2.2]" />
        </button>
      </div>

      {/* Mobile menu drawer rendered via Portal directly into document.body */}
      {menuOpen && mounted && createPortal(
        <div className="md:hidden fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[82vw] max-w-xs bg-surface shadow-2xl flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between px-4 h-14 border-b border-card-border shrink-0">
              <span className="font-semibold text-content">Menu</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid place-items-center h-9 w-9 rounded-lg hover:bg-surface-secondary text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {session ? (
                <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 border-b border-card-border">
                  <span className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center font-semibold">
                    {session.user?.name?.[0]?.toUpperCase() || "U"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-content truncate">{session.user?.name}</span>
                    <span className="block text-[11px] text-content-tertiary">View account</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-content-tertiary ml-auto" />
                </Link>
              ) : (
                <Link href="/login" className="flex items-center gap-3 px-4 py-3 border-b border-card-border text-sm font-medium text-primary">
                  <UserIcon className="h-4 w-4" /> Log in or sign up
                </Link>
              )}

              <p className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                Categories
                {location.city && (
                  <span className="normal-case tracking-normal font-medium inline-flex items-center gap-0.5 text-primary">
                    <MapPin className="h-3 w-3" />{location.label}
                  </span>
                )}
              </p>
              {categories.map((c) => (
                <Link key={c.slug} href={catHref(c.path)} prefetch className="flex items-center justify-between px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-secondary">
                  {c.name} <ChevronRight className="h-4 w-4 text-content-tertiary" />
                </Link>
              ))}

              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">More</p>
              {[
                ...(session ? [{ href: "/dashboard/notifications", label: "Notifications" }] : []),
                { href: "/chat", label: "Messages" },
                { href: "/dashboard/plans", label: "Plans & Boost" },
                { href: "/blog", label: "News" },
                { href: "/faq", label: "Help & FAQ" },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="flex items-center justify-between px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-secondary">
                  {l.label} <ChevronRight className="h-4 w-4 text-content-tertiary" />
                </Link>
              ))}

              {session && (
                <button onClick={() => { setMenuOpen(false); logout("/"); }} className="w-full text-left px-4 py-3 mt-2 border-t border-card-border text-sm font-medium text-danger">
                  Log out
                </button>
              )}
            </div>

            <div className="p-3 border-t border-card-border shrink-0">
              <Link href="/ads/post" className="flex items-center justify-center gap-2 h-11 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold text-sm shadow-xs transition-colors">
                <Plus className="h-4 w-4 stroke-[3px]" /> Post an ad
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}

/** The bell with the unread count (signed-in only). */
function BellLink({ count }: { count: number }) {
  return (
    <Link href="/dashboard/notifications" aria-label={count ? `Notifications, ${count} unread` : "Notifications"} className="relative grid place-items-center h-9 w-9 rounded-lg text-slate-700 hover:text-primary hover:bg-slate-100 transition-colors shrink-0">
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center tabular-nums ring-2 ring-white">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
  );
}
