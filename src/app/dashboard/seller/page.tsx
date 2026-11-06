import React from "react";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Listing from "@/models/Listing";
import { getServerSession } from "@/lib/auth";
import { getEntitlements } from "@/lib/plan";
import { SellerDashboard } from "./SellerDashboard";
import { getSettings } from "@/lib/settings";
import { VERTICAL } from "@/vertical";

export const metadata = { title: "My Dashboard", robots: { index: false, follow: true } };
// Session-gated — never worth a static generation attempt at build time.
export const dynamic = "force-dynamic";

export default async function SellerDashboardPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?callbackUrl=/dashboard/seller");

  await dbConnect();
  const [userDoc, listings, ent, settings] = await Promise.all([
    User.findById(session.userId).select("name email profileImage createdAt rating ratingCount verificationLevel verificationStatus verificationDoc salesCount city isSeller").lean(),
    Listing.find({ userId: session.userId })
      .sort({ createdAt: -1 })
      .limit(1000) // bounded even for the largest shops
      .select("name slug price status clicks impressions favouritesCount phoneClicks whatsappClicks chatClicks expiresAt flagReasons mainImage galleryImages condition city createdAt isFeatured featuredExpiresAt customFieldValues")
      .lean(),
    getEntitlements(session.userId),
    getSettings(),
  ]);

  // Buyer mode → send to the buyer account hub (seller features stay hidden)
  if (!(userDoc as any)?.isSeller) redirect("/dashboard");

  const user = JSON.parse(JSON.stringify(userDoc || { name: session.user.name }));
  const items = JSON.parse(JSON.stringify(listings));
  const plan = JSON.parse(JSON.stringify(ent));
  const days = (k: string, d: number) => { const v = Number(settings[k]); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d; };
  const expiry = { days: days("listing_expiry_days", 30), renewDays: days("expired_reactivation_days", 30) };
  return <SellerDashboard user={user} listings={items} plan={plan} siteName={settings.site_name || VERTICAL.defaults.siteName} expiry={expiry} />;
}
