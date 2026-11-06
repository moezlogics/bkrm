import React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getBranding } from "@/lib/branding";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata = {
  title: "Admin sign-in",
  robots: { index: false, follow: true, nocache: true, googleBot: { index: false, follow: true } },
};
// Per request: an admin who is already signed in goes straight to the panel.
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const session = await getServerSession();
  if (session?.role === "admin") redirect("/admin");
  const brand = getBranding(await getSettings().catch(() => ({} as Record<string, string>)));
  return <AdminLoginForm siteName={brand.logoText} logo={brand.logo} color={brand.primary || "#1a56db"} />;
}
