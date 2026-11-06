"use client";

import Image from "next/image";
import { iconFor } from "@/vertical/icons";
import { imageProps } from "@/lib/cdn-image";

/**
 * A section's picture: the cover photo of its top ad (see lib/section-covers),
 * or — while a section has no ads — its icon on a soft green tile.
 */
export function SectionThumb({ src, icon, className = "", sizes = "80px" }: { src?: string; icon?: string | null; className?: string; sizes?: string }) {
  if (src) {
    return (
      <span className={`relative block overflow-hidden bg-surface-tertiary shrink-0 ${className}`}>
        <Image src={src} {...imageProps(src)} alt="" fill sizes={sizes} className="object-cover" />
      </span>
    );
  }
  const Icon = iconFor(icon);
  return (
    <span className={`grid place-items-center bg-primary-soft text-primary shrink-0 ${className}`}>
      <Icon className="h-1/2 w-1/2" />
    </span>
  );
}
