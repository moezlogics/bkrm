"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { House, Search, Plus, MessageCircle, CircleUserRound } from "lucide-react";
import { useBadges } from "@/lib/badges-client";
import { VERTICAL } from "@/vertical";

/**
 * Phone tab bar: Home, Browse, Sell, Chats, Account — a full-width bar like a
 * native app's, with Sell as the one filled action in the middle.
 * `browseHref` is the visitor's location archive (e.g. /lahore).
 */
export function MobileNav({ browseHref = "/ads" }: { browseHref?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const badges = useBadges(!!session);

  // The ad page and the auth screens own the whole viewport.
  if (pathname.startsWith("/ads/") && pathname !== "/ads/post") return null;
  if (["/login", "/signup", "/newlogin", "/setup", "/forgot-password"].includes(pathname)) return null;

  const items = [
    { key: "home", label: "Home", href: "/", Icon: House },
    { key: "search", label: "Browse", href: browseHref, Icon: Search },
    { key: "sell", label: "Sell", href: "/ads/post", Icon: Plus },
    { key: "chat", label: "Chats", href: "/chat", Icon: MessageCircle },
    { key: "account", label: "Account", href: session ? "/dashboard" : "/login", Icon: CircleUserRound },
  ];

  const activeKey = (() => {
    if (pathname === "/") return "home";
    if (pathname.startsWith("/ads/post")) return "sell";
    if (pathname.startsWith("/chat")) return "chat";
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/login") || pathname.startsWith("/signup")) return "account";
    if (!/^\/(blog|faq|page|admin)/.test(pathname)) return "search";
    return "";
  })();

  return (
    <nav className="app-nav" aria-label="Main navigation">
      {items.map(({ key, label, href, Icon }) => {
        const on = activeKey === key;
        if (key === "sell") {
          return (
            <Link key={key} href={href} aria-label={VERTICAL.copy.sellCta}>
              <span className="app-nav-sell-btn"><Icon className="!h-5 !w-5 !stroke-[2.6]" /></span>
              <span className="!text-primary !font-bold">{label}</span>
            </Link>
          );
        }
        return (
          <Link key={key} href={href} prefetch className={on ? "is-active" : ""} aria-current={on ? "page" : undefined}>
            <span className="relative inline-flex">
              <Icon />
              {key === "chat" && badges.chats > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-danger text-white text-[11px] font-bold leading-[17px] text-center tabular-nums ring-2 ring-white" aria-label={`${badges.chats} unread`}>{badges.chats > 99 ? "99+" : badges.chats}</span>
              )}
              {key === "account" && badges.notifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-white" aria-label="New notifications" />
              )}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
