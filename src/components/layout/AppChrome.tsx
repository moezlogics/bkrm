"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * "App screens" behave like screens of a mobile app: no site header, footer
 * or bottom tab bar — just their own top bar with a back button. Browsing
 * pages keep the full site chrome.
 */
const APP_SCREENS = [/^\/admin(\/|$)/, /^\/newlogin$/, /^\/setup$/, /^\/dashboard(\/|$)/, /^\/ads\/post$/, /^\/ads\/[^/]+\/edit$/, /^\/ads\/[^/]+\/book$/, /^\/chat$/];
export const isAppScreen = (p: string | null) => !!p && APP_SCREENS.some((r) => r.test(p));

/** Renders site chrome (header, footer, bottom bar) only on browsing pages. */
export function SiteChromeOnly({ children }: { children: React.ReactNode }) {
  return isAppScreen(usePathname()) ? null : <>{children}</>;
}

/** <main> that clears the fixed site header only where the header is shown. */
export function MainArea({ children }: { children: React.ReactNode }) {
  const app = isAppScreen(usePathname());
  return <main className={app ? "app-screen flex-1 flex flex-col" : "flex-1 pt-[var(--header-height)]"}>{children}</main>;
}

/**
 * Top bar for app screens: back arrow, title, optional right-side action.
 * Back goes to the previous screen when there is one in this tab, otherwise
 * to `backHref` (so a deep link never dead-ends).
 */
export function AppBar({
  title, subtitle, backHref = "/", right, onBack,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const back = () => {
    if (onBack) return onBack();
    // history.length > 1 isn't reliable across entry points; use the referrer
    // when it's this site, else the explicit parent.
    const sameSite = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
    if (sameSite && window.history.length > 1) router.back();
    else router.push(backHref);
  };
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-card-border pt-[env(safe-area-inset-top)]">
      <div className="h-14 max-w-5xl mx-auto px-2 sm:px-4 flex items-center gap-1">
        <button type="button" onClick={back} className="grid place-items-center h-10 w-10 rounded-full hover:bg-surface-secondary active:bg-surface-tertiary shrink-0" aria-label="Back">
          <ArrowLeft className="h-[22px] w-[22px] text-content" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="text-[16.5px] font-bold text-content truncate leading-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-content-tertiary truncate">{subtitle}</p>}
        </div>
        {right && <div className="flex items-center gap-1 shrink-0">{right}</div>}
      </div>
    </header>
  );
}

/** Small round icon link for AppBar's right slot. */
export function AppBarLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className="grid place-items-center h-10 w-10 rounded-full hover:bg-surface-secondary text-content">
      {children}
    </Link>
  );
}
