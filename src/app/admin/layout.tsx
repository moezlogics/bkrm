"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { logout } from "@/lib/logout";
import {
  LayoutDashboard, LayoutGrid, FolderTree, Sliders, ClipboardList, Users, Flag, MapPin, FileText,
  HelpCircle, Newspaper, Bell, Image as ImageIcon, Images, CreditCard, Settings, ShieldAlert, ShieldCheck,
  Loader2, LogOut, Menu, X, ExternalLink, Palette, BarChart3, History, CalendarCheck,
} from "lucide-react";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

type Item = { label: string; href: string; icon: React.ElementType };
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "", items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }, { label: "Insights", href: "/admin/insights", icon: BarChart3 }] },
  {
    title: "Marketplace",
    items: [
      { label: "Listings & Moderation", href: "/admin/listings", icon: ClipboardList },
      ...(BOOKINGS_ON ? [{ label: "Bookings", href: "/admin/bookings", icon: CalendarCheck }] : []),
      { label: "Categories", href: "/admin/categories", icon: FolderTree },
      { label: "Custom Fields", href: "/admin/custom-fields", icon: Sliders },
      { label: "Locations", href: "/admin/locations", icon: MapPin },
      { label: "Homepage Sections", href: "/admin/homepage", icon: LayoutGrid },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Verifications", href: "/admin/verifications", icon: ShieldCheck },
      { label: "Reports", href: "/admin/reports", icon: Flag },
    ],
  },
  { title: "Payments", items: [{ label: "Invoices & Payments", href: "/admin/invoices", icon: CreditCard }] },
  {
    title: "Content",
    items: [
      { label: "Media Library", href: "/admin/media", icon: Images },
      { label: "Sliders", href: "/admin/sliders", icon: ImageIcon },
      { label: "CMS Pages", href: "/admin/pages", icon: FileText },
      { label: "Blog", href: "/admin/blog", icon: Newspaper },
      { label: "FAQ", href: "/admin/faq", icon: HelpCircle },
    ],
  },
  {
    title: "Engagement",
    items: [{ label: "Push notifications", href: "/admin/push", icon: Bell }],
  },
  {
    title: "System",
    items: [
      { label: "Branding & Appearance", href: "/admin/settings?tab=branding", icon: Palette },
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "Activity log", href: "/admin/activity", icon: History },
    ],
  },
];
const ALL = SECTIONS.flatMap((s) => s.items);

const isActive = (pathname: string, href: string) => {
  const path = href.split("?")[0];
  return path === "/admin" ? pathname === "/admin" : pathname === path || pathname.startsWith(path + "/");
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [drawer, setDrawer] = useState(false);
  // Waiting-for-review badges (verifications, listings in review, reports, payments).
  const [counts, setCounts] = useState<Record<string, number>>({});
  const isAdmin = (session as any)?.role === "admin";
  useEffect(() => {
    if (!isAdmin) return;
    const load = () => fetch("/api/admin/counts").then((r) => r.json()).then((j) => j?.success && setCounts(j.data)).catch(() => {});
    load();
    const iv = setInterval(() => { if (document.visibilityState === "visible") load(); }, 60_000);
    window.addEventListener("admin-counts-refresh", load);
    return () => { clearInterval(iv); window.removeEventListener("admin-counts-refresh", load); };
  }, [isAdmin, pathname]);

  useEffect(() => {
    if (status === "unauthenticated") {
      toast.error("Please sign in as an admin.");
      router.push("/newlogin");
    } else if (session && (session as any).role !== "admin") {
      toast.error("Admin access required.");
      router.push("/");
    }
  }, [status, session, router, toast]);

  useEffect(() => setDrawer(false), [pathname]);

  if (status === "loading") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <span className="text-sm font-semibold text-content-secondary">Checking admin access…</span>
      </div>
    );
  }

  if (!session || (session as any).role !== "admin") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center p-8 gap-4">
        <ShieldAlert className="h-16 w-16 text-danger" />
        <h1 className="text-2xl font-bold text-content">Admin access required</h1>
        <p className="text-sm text-content-secondary max-w-sm">This area is only for administrators. Please sign in with an admin account.</p>
        <div className="flex items-center gap-3 mt-2">
          <Link href="/newlogin" className="bg-primary text-white font-bold py-2.5 px-6 rounded-xl text-sm">Admin sign in</Link>
          <Link href="/" className="bg-surface-secondary border border-card-border font-bold py-2.5 px-6 rounded-xl text-sm text-content">Back to site</Link>
        </div>
      </div>
    );
  }

  const current = [...ALL].reverse().find((i) => isActive(pathname, i.href));
  const name = session.user?.name || "Administrator";

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4">
      {SECTIONS.map((s) => (
        <div key={s.title || "main"} className="flex flex-col gap-0.5">
          {s.title && <span className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">{s.title}</span>}
          {s.items.map((item) => {
            const Icon = item.icon;
            const on = current?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-[14px] font-semibold ${on ? "bg-primary text-white" : "text-zinc-300 hover:bg-zinc-900 hover:text-white"}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate flex-1">{item.label}</span>
                {counts[item.href] > 0 && (
                  <span className={`ml-auto min-w-5 h-5 px-1.5 rounded-full text-[12px] font-bold grid place-items-center ${on ? "bg-white text-primary" : "bg-amber-500 text-white"}`} aria-label={`${counts[item.href]} waiting`}>
                    {counts[item.href] > 99 ? "99+" : counts[item.href]}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const aside = (
    <aside className="w-64 h-full bg-zinc-950 border-r border-zinc-900 flex flex-col">
      <div className="h-16 border-b border-zinc-900 flex items-center justify-between px-4 shrink-0">
        <Link href="/admin" className="font-bold tracking-tight text-white text-lg">Admin Panel</Link>
        <button onClick={() => setDrawer(false)} className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900" aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      {nav}
      <div className="p-3 border-t border-zinc-900 flex flex-col gap-1 shrink-0">
        <a href={withBasePath("/")} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white">
          <ExternalLink className="h-[18px] w-[18px]" /> View site
        </a>
        <button onClick={() => logout("/newlogin")} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-semibold text-red-400 hover:bg-zinc-900">
          <LogOut className="h-[18px] w-[18px]" /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-dvh flex bg-surface-secondary">
      {/* Desktop sidebar */}
      <div className="hidden lg:block sticky top-0 h-dvh shrink-0">{aside}</div>
      {/* Phone / tablet drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="relative h-full">{aside}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 h-16 border-b border-card-border bg-card/95 backdrop-blur flex items-center justify-between gap-3 px-4 lg:px-6 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setDrawer(true)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-secondary" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <span className="text-sm font-semibold text-content truncate">{current?.label || "Admin"}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={withBasePath("/")} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-card-border text-xs font-semibold text-content-secondary hover:text-primary hover:border-primary">
              <ExternalLink className="h-3.5 w-3.5" /> View site
            </a>
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm" title={name}>{name[0]?.toUpperCase() || "A"}</div>
            <span className="text-sm font-semibold text-content hidden md:inline max-w-[160px] truncate">{name}</span>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}
