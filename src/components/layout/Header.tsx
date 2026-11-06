"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { logout } from "@/lib/logout";
import {
  Plus, User as UserIcon, LogOut, Settings, ChevronDown, LayoutDashboard,
  MessageCircle, Heart, Menu, X, ChevronRight, MapPin, Bell, CalendarCheck, HelpCircle, Newspaper, BadgePercent,
} from "lucide-react";
import { useBadges } from "@/lib/badges-client";
import { usePathname } from "next/navigation";
import { LocationPicker } from "./LocationPicker";
import { SearchBox } from "@/components/search/SearchBox";
import type { ClientLocation, PlacesMap } from "@/lib/visitor-location";
import type { Branding } from "@/lib/branding";
import { VERTICAL } from "@/vertical";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { SectionThumb } from "@/components/home/SectionThumb";

const searchHint = VERTICAL.copy.searchHint || `Search ${VERTICAL.noun.many}`;

type Cat = { name: string; slug: string; path: string; icon?: string | null };

/**
 * Site header. Phones: a slim app bar (logo, location, bell, menu) over a
 * rounded search field; the app bar tucks away on scroll so the search stays.
 * Desktop: one row — logo, location + search, quick links, account, Sell.
 * Location comes from the server (cookie), so links are scoped on first paint.
 */
export function Header({
  siteName = "Classifieds", brand, categories = [], covers = {}, location: saved, places = {},
}: { siteName?: string; brand?: Branding; categories?: Cat[]; covers?: Record<string, string>; location: ClientLocation; places?: PlacesMap }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const badges = useBadges(!!session);

  // On a location-scoped page (/karachi/bakray) the page's own location wins.
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
  // The ad page has its own full-bleed top on phones.
  const immersive = pathname.startsWith("/ads/") && pathname !== "/ads/post";

  const [acctOpen, setAcctOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setMenuOpen(false); setAcctOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 4);
      if (y > 60 && y > lastY + 4) setTucked(true);
      else if (y < lastY - 6 || y <= 20) setTucked(false);
      lastY = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const catHref = (path: string) => `${location.prefix}/${path}`;
  const initial = session?.user?.name?.[0]?.toUpperCase() || "U";

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 bg-white transition-[transform,box-shadow] duration-300 ease-out
        ${scrolled ? "shadow-[0_1px_0_var(--card-border)]" : ""}
        ${tucked ? "max-md:-translate-y-[52px]" : "translate-y-0"} ${immersive ? "max-md:hidden" : ""}`}
    >
      <div className="wrap h-[52px] md:h-[72px] flex items-center gap-3 md:gap-5">
        <Link href="/" prefetch className="shrink-0 flex items-center" aria-label={siteName}>
          {brand?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt={siteName} className="site-logo max-h-11 md:max-h-12 object-contain" fetchPriority="high" />
          ) : (
            <Wordmark name={siteName} />
          )}
        </Link>

        {/* Desktop: location + search */}
        <SearchBox
          variant="desktop"
          className="hidden md:block flex-1 max-w-2xl"
          leading={<div className="flex items-center pl-4 pr-3 h-full border-r border-card-border shrink-0"><LocationPicker location={location} /></div>}
        />

        {/* Desktop quick links */}
        <nav className="hidden lg:flex items-center gap-1 text-[14.5px] font-semibold text-content-secondary">
          {VERTICAL.bookings?.service && (
            <Link href={`${location.prefix}/${VERTICAL.bookings.service.tops[0]}`} className="px-3 h-10 inline-flex items-center rounded-full hover:bg-surface-secondary hover:text-content transition-colors">{VERTICAL.bookings.service.title}</Link>
          )}
          {VERTICAL.bookings?.share && (
            <Link href={`${location.prefix}/${VERTICAL.bookings.share.tops[0]}`} className="px-3 h-10 inline-flex items-center rounded-full hover:bg-surface-secondary hover:text-content transition-colors">{VERTICAL.bookings.share.title}</Link>
          )}
        </nav>

        <div className="ml-auto md:ml-0 flex items-center gap-1 md:gap-2 shrink-0">
          <div className="md:hidden min-w-0"><LocationPicker location={location} variant="compact" autoDetect /></div>

          {session && (
            <>
              <IconLink href="/chat" label="Chats" count={badges.chats} className="hidden md:grid"><MessageCircle className="h-[21px] w-[21px]" /></IconLink>
              <IconLink href="/dashboard/saved" label="Saved" className="hidden md:grid"><Heart className="h-[21px] w-[21px]" /></IconLink>
              <IconLink href="/dashboard/notifications" label="Notifications" count={badges.notifications}><Bell className="h-[21px] w-[21px]" /></IconLink>
            </>
          )}

          {status === "loading" ? (
            <div className="hidden md:block h-10 w-10 rounded-full bg-surface-secondary animate-pulse" />
          ) : session ? (
            <div className="relative hidden md:block">
              <button onClick={() => setAcctOpen((o) => !o)} className="flex items-center gap-1 pl-1 pr-2 h-11 rounded-full hover:bg-surface-secondary transition-colors" aria-expanded={acctOpen} aria-label="Account menu">
                {session.user?.image ? (
                  <Image src={session.user.image} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="h-9 w-9 rounded-full bg-primary-soft text-primary-dark grid place-items-center font-bold text-sm">{initial}</span>
                )}
                <ChevronDown className="h-4 w-4 text-content-tertiary" />
              </button>
              {acctOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAcctOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-2 z-20 animate-slide-up">
                    <div className="px-3 py-2.5 mb-1">
                      <p className="text-sm font-bold truncate text-content">{session.user?.name}</p>
                      <p className="text-xs text-content-tertiary truncate">{session.user?.email}</p>
                    </div>
                    {[
                      { href: "/dashboard", icon: LayoutDashboard, label: "My account" },
                      { href: "/dashboard/seller", icon: BadgePercent, label: "My ads" },
                      ...(BOOKINGS_ON ? [{ href: "/dashboard/bookings", icon: CalendarCheck, label: "Bookings" }] : []),
                      { href: "/dashboard/saved", icon: Heart, label: "Saved" },
                    ].map((it) => (
                      <Link key={it.href} href={it.href} onClick={() => setAcctOpen(false)} className="flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium text-content-secondary hover:text-content hover:bg-surface-secondary transition-colors">
                        <it.icon className="h-[18px] w-[18px]" /> {it.label}
                      </Link>
                    ))}
                    {(session as any).role === "admin" && (
                      <Link href="/admin" onClick={() => setAcctOpen(false)} className="flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-semibold text-primary hover:bg-primary-soft">
                        <Settings className="h-[18px] w-[18px]" /> Admin panel
                      </Link>
                    )}
                    <div className="h-px bg-card-border my-1.5 mx-2" />
                    <button onClick={() => { setAcctOpen(false); logout("/"); }} className="w-full flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium text-danger hover:bg-danger-light/60 text-left">
                      <LogOut className="h-[18px] w-[18px]" /> Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" className="hidden md:inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-semibold text-content hover:bg-surface-secondary transition-colors">
              <UserIcon className="h-[18px] w-[18px]" /> Log in
            </Link>
          )}

          <Link href="/ads/post" className="hidden md:inline-flex items-center gap-1.5 h-11 pl-4 pr-5 rounded-full bg-primary hover:bg-primary-dark text-white text-sm font-bold transition-colors">
            <Plus className="h-[18px] w-[18px] stroke-[2.6]" /> Sell
          </Link>

          <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="md:hidden grid place-items-center h-10 w-10 -mr-2 rounded-full text-content active:bg-surface-secondary">
            <Menu className="h-[22px] w-[22px]" />
          </button>
        </div>
      </div>

      {/* Phones: search row (stays when the app bar tucks away) */}
      <div className="md:hidden wrap pb-3">
        <SearchBox variant="mobile" className="w-full" placeholder={searchHint} />
      </div>

      {menuOpen && mounted && createPortal(
        <div className="md:hidden fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-overlay animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[86vw] max-w-sm bg-surface flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between px-4 h-14 shrink-0">
              <span className="text-base font-bold text-content">Menu</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid place-items-center h-10 w-10 -mr-2 rounded-full active:bg-surface-secondary text-content">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {session ? (
                <Link href="/dashboard" className="flex items-center gap-3 p-3 rounded-2xl bg-surface-secondary">
                  <span className="h-11 w-11 rounded-full bg-primary text-white grid place-items-center font-bold">{initial}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-content truncate">{session.user?.name}</span>
                    <span className="block text-xs text-content-tertiary">View your account</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-content-tertiary" />
                </Link>
              ) : (
                <div className="p-4 rounded-2xl bg-surface-secondary">
                  <p className="text-[15px] font-bold text-content">Welcome to {siteName}</p>
                  <p className="text-xs text-content-secondary mt-0.5">Log in to chat, save ads and book.</p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Link href="/login" className="h-10 grid place-items-center rounded-xl bg-primary text-white text-sm font-bold">Log in</Link>
                    <Link href="/signup" className="h-10 grid place-items-center rounded-xl bg-white text-content text-sm font-bold ring-1 ring-card-border">Sign up</Link>
                  </div>
                </div>
              )}

              <p className="px-2 pt-5 pb-2 flex items-center gap-1.5 text-xs font-semibold text-content-tertiary">
                Browse
                {location.city && (
                  <span className="inline-flex items-center gap-0.5 text-primary font-semibold"><MapPin className="h-3 w-3" />{location.label}</span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((c) => (
                  <Link key={c.slug} href={catHref(c.path)} prefetch className="flex items-center gap-2.5 p-2 rounded-xl bg-white ring-1 ring-card-border active:bg-surface-secondary">
                    <SectionThumb src={covers[c.slug]} icon={c.icon} className="h-9 w-9 rounded-lg" />
                    <span className="text-[14px] font-semibold text-content leading-tight line-clamp-2">{c.name}</span>
                  </Link>
                ))}
              </div>

              <p className="px-2 pt-5 pb-2 text-xs font-semibold text-content-tertiary">More</p>
              <div className="rounded-2xl ring-1 ring-card-border overflow-hidden divide-y divide-card-border bg-white">
                {[
                  { href: "/chat", label: "Chats", icon: MessageCircle },
                  ...(BOOKINGS_ON ? [{ href: "/dashboard/bookings", label: "My bookings", icon: CalendarCheck }] : []),
                  { href: "/dashboard/plans", label: "Plans & boost", icon: BadgePercent },
                  { href: "/blog", label: "Guides", icon: Newspaper },
                  { href: "/faq", label: "Help & FAQ", icon: HelpCircle },
                ].map((l) => (
                  <Link key={l.href} href={l.href} className="flex items-center gap-3 px-4 h-12 text-sm font-medium text-content active:bg-surface-secondary">
                    <l.icon className="h-[18px] w-[18px] text-content-secondary" />
                    <span className="flex-1">{l.label}</span>
                    <ChevronRight className="h-4 w-4 text-content-tertiary" />
                  </Link>
                ))}
              </div>

              {session && (
                <button onClick={() => { setMenuOpen(false); logout("/"); }} className="w-full mt-3 h-12 rounded-2xl text-sm font-semibold text-danger bg-white ring-1 ring-card-border">
                  Log out
                </button>
              )}
            </div>

            <div className="p-3 pb-[calc(12px+env(safe-area-inset-bottom))] shrink-0">
              <Link href="/ads/post" className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-white font-bold text-[15px]">
                <Plus className="h-5 w-5 stroke-[2.6]" /> {VERTICAL.copy.sellCta}
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}

/** Text logo when no image logo is uploaded. */
function Wordmark({ name }: { name: string }) {
  return (
    <span className="text-[17px] md:text-[19px] font-extrabold tracking-tight text-content">{name}</span>
  );
}

function IconLink({ href, label, count = 0, className = "grid", children }: { href: string; label: string; count?: number; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={count ? `${label}, ${count} unread` : label} title={label}
      className={`relative place-items-center h-10 w-10 md:h-11 md:w-11 rounded-full text-content hover:bg-surface-secondary active:bg-surface-tertiary transition-colors shrink-0 ${className}`}>
      {children}
      {count > 0 && (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center tabular-nums ring-2 ring-white">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
  );
}
