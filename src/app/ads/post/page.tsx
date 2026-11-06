import React from "react";
import { redirect } from "next/navigation";
import { PostWizard } from "./PostWizard";
import { getVisitorLocation } from "@/lib/visitor-location";
import { getWizardData } from "./wizard-data";
import { getServerSession } from "@/lib/auth";
import { getEntitlements } from "@/lib/plan";
import dbConnect from "@/lib/mongodb";
import { VERTICAL } from "@/vertical";

export const metadata = {
  // It said "Sell your mobile" on every vertical (left over from the mobiles site).
  title: VERTICAL.copy.sellCta,
  robots: { index: false, follow: true },
};
// Per-visitor (session, listing limit) — never a static page.
export const dynamic = "force-dynamic";

export default async function PostPage() {
  // Out of free (or plan) listings → straight to the plans, before filling in
  // a whole ad only to be refused at the end (what OLX / dubizzle do).
  const session = await getServerSession();
  if (session) {
    await dbConnect();
    const ent = await getEntitlements(session.userId).catch(() => null);
    if (ent && ent.listingsUsed >= ent.listingLimit) redirect(`/dashboard/plans?reason=limit&max=${ent.listingLimit}&free=${ent.isFree ? 1 : 0}`);
  }
  const [data, loc] = await Promise.all([getWizardData(), getVisitorLocation()]);
  // Pre-fill where the seller is (OLX does the same); they can still change it.
  return <PostWizard {...data} defaultCity={loc.city?.name ?? ""} defaultArea={loc.area?.name ?? ""} />;
}
