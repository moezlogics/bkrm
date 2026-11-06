"use client";

import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  User,
  Menu,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const breadcrumbNames: Record<string, string> = {
  admin: "Admin",
  categories: "Categories",
  "custom-fields": "Custom Fields",
  listings: "Listings",
  users: "Users",
  packages: "Packages",
  sliders: "Sliders",
  settings: "Settings",
  reports: "Reports",
  "report-reasons": "Report Reasons",
  notifications: "Notifications",
};

interface AdminHeaderProps {
  onToggleSidebar: () => void;
}

export default function AdminHeader({ onToggleSidebar }: AdminHeaderProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const segments = pathname.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 lg:px-6">
      <div className="flex items-center justify-between h-16">
        {/* Left: hamburger + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <nav className="hidden sm:flex items-center gap-1 text-sm">
            {segments.map((seg, i) => (
              <span key={seg + i} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                )}
                {i === segments.length - 1 ? (
                  <span className="font-medium text-gray-900">
                    {breadcrumbNames[seg] || seg}
                  </span>
                ) : (
                  <Link
                    href={`/${segments.slice(0, i + 1).join("/")}`}
                    className="text-gray-500 hover:text-[#6C5CE7]"
                  >
                    {breadcrumbNames[seg] || seg}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>

        {/* Right: search + notifications + user */}
        <div className="flex items-center gap-2">
          <div className="hidden md:block relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-[#6C5CE7]/20 focus:border-[#6C5CE7] bg-gray-50"
            />
          </div>

          <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E17055] rounded-full" />
          </button>

          {/* User dropdown */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#6C5CE7] flex items-center justify-center">
                <span className="text-white text-xs font-bold">AD</span>
              </div>
              <span className="hidden md:block text-sm font-medium text-gray-700">
                Admin
              </span>
              <ChevronDown className="hidden md:block w-4 h-4 text-gray-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                <Link
                  href="/admin/settings"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
                <Link
                  href="/admin/users"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <User className="w-4 h-4" />
                  Profile
                </Link>
                <hr className="my-1 border-gray-100" />
                <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
