"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useBadges } from "@/lib/badges-client";
import { VERTICAL } from "@/vertical";

/**
 * Floating glass tab bar — visual parity with the main PHP site's
 * `.site-mobile-nav` (same geometry, blur, radius and active indicator) so the
 * marketplace subdomain reads as the same app.
 *
 * Icons are inline SVG at a matched 21px/1.9 stroke rather than an icon
 * component, to keep the two codebases visually identical.
 */

const Ico = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  ),
  sell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.8-.9L3 21l1.9-5A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  ),
};

/** `browseHref` = the visitor's location archive (e.g. /lahore), so "Search" browses near them. */
export function MobileNav({ browseHref = "/ads" }: { browseHref?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const badges = useBadges(!!session);

  // Immersive listing detail and the clean auth screens own the whole viewport.
  if (pathname.startsWith("/ads/") && pathname !== "/ads/post") return null;
  if (["/login", "/signup", "/newlogin", "/setup", "/forgot-password"].includes(pathname)) return null;

  const items = [
    { key: "home", label: "Home", href: "/", icon: Ico.home },
    { key: "search", label: "Search", href: browseHref, icon: Ico.search },
    { key: "sell", label: "Sell", href: "/ads/post", icon: Ico.sell },
    { key: "chat", label: "Chat", href: "/chat", icon: Ico.chat },
    { key: "account", label: "Account", href: session ? "/dashboard" : "/login", icon: Ico.account },
  ];

  // A tab is always lit — browse archives (/mobile-phones, /lahore/... ) are
  // the Search section, so the bar never looks "off" mid-journey.
  const activeKey = (() => {
    if (pathname === "/") return "home";
    if (pathname.startsWith("/ads/post")) return "sell";
    if (pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/login") || pathname.startsWith("/signup")) return "account";
    if (pathname.startsWith("/ads") || pathname.startsWith("/shop")) return "search";
    // Anything else that isn't a static page is a category/city archive.
    if (!/^\/(blog|faq|page|admin)/.test(pathname)) return "search";
    return "";
  })();

  return (
    <nav className="app-nav" aria-label="Main navigation">
      {items.map((it) => {
        const on = activeKey === it.key;
        if (it.key === "sell") {
          return (
            <Link
              key={it.key}
              href={it.href}
              className="relative flex flex-col items-center justify-center -mt-4 shrink-0 px-1 active:scale-90 transition-transform duration-150"
              aria-label={VERTICAL.copy.sellCta}
            >
              <div className="app-nav-sell-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
              <span className="text-[10px] font-semibold text-primary leading-none -mt-1.5">{it.label}</span>
            </Link>
          );
        }
        return (
          <Link
            key={it.key}
            href={it.href}
            prefetch
            className={`group transition-all duration-150 active:scale-90 ${on ? "is-active" : ""}`}
            aria-current={on ? "page" : undefined}
          >
            <span className="relative inline-flex">
              {it.icon}
              {it.key === "chat" && badges.chats > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[17px] text-center tabular-nums ring-2 ring-white" aria-label={`${badges.chats} unread`}>{badges.chats > 99 ? "99+" : badges.chats}</span>
              )}
              {it.key === "account" && badges.notifications > 0 && (
                <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-label="New notifications" />
              )}
            </span>
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
