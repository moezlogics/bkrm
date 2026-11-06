"use client";

import React from "react";
import Link from "next/link";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";

/**
 * A <Link> that fully prefetches its page once the visitor shows intent
 * (touch, hover or focus) — see useIntentPrefetch. No dwell arming: these are
 * secondary links, and prefetching every one that's merely visible costs more
 * than it saves.
 * Drop-in for server components that render many secondary links
 * (area chips, brand chips, breadcrumbs, "View all").
 */
export function IntentLink(props: Omit<React.ComponentProps<typeof Link>, "prefetch" | "ref">) {
  const pf = useIntentPrefetch<HTMLAnchorElement>();
  return <Link {...props} ref={pf.ref} prefetch={pf.prefetch} {...pf.intentProps} />;
}
