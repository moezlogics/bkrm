import React from "react";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getBranding } from "@/lib/branding";

/** Site logo (admin-uploaded) or the site name, for auth screens. */
export async function BrandMark() {
  const s = await getSettings();
  const b = getBranding(s);
  const name = s.site_name || process.env.NEXT_PUBLIC_APP_NAME || "Classifieds";
  return (
    <Link href="/" className="inline-flex items-center justify-center" aria-label={name}>
      {b.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logo} alt={name} className="h-10 w-auto object-contain" />
      ) : (
        <span className="text-2xl font-bold tracking-tight text-content">
          {name}
        </span>
      )}
    </Link>
  );
}
