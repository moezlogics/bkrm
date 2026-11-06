import React from "react";
import { notFound } from "next/navigation";
import { needsSetup, setupKeyRequired } from "@/lib/setup-state";
import { bundleSummary } from "@/lib/setup";
import { VERTICAL } from "@/vertical";
import { SetupForm } from "./SetupForm";

export const metadata = {
  title: "Set up your marketplace",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

/** First-run setup — exists only until the site has been set up. */
export default async function SetupPage() {
  if (!(await needsSetup().catch(() => false))) notFound();
  const bundle = bundleSummary();
  return (
    <SetupForm
      vertical={{ id: VERTICAL.id, many: VERTICAL.noun.many, One: VERTICAL.noun.One, defaultName: bundle?.siteName || VERTICAL.defaults.siteName, icon: VERTICAL.icon }}
      needsKey={setupKeyRequired()}
      bundle={bundle}
    />
  );
}
