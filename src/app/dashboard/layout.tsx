import React from "react";

/**
 * Dashboard screens are app screens: no site header, footer or bottom tab bar
 * (see components/layout/AppChrome). Each page renders its own AppBar with a
 * back button, like a native account area.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-surface-secondary flex flex-col">{children}</div>;
}
