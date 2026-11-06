/**
 * Pre-generate a new ad's optimised images so its first viewer never waits.
 *
 * next/image resizes + re-encodes on the first request for each (image, width,
 * format) and caches the result; that first request took ~2 s here, which is
 * exactly when a brand-new ad is most likely to be looked at. Requesting the
 * sizes the UI actually asks for, right after publishing, moves that cost off
 * the buyer's screen.
 *
 * Widths mirror what browsers pick for the current `sizes` attributes:
 *   card  "(max-width: 640px) 128px, 176px" → 256 / 384 at 2-3× DPR
 *   hero  "(max-width: 768px) 100vw, …"     → 828 / 1080 on phones
 */
import { isCdnImage, cdnLoader } from "@/lib/cdn-image";

const CARD_WIDTHS = [256, 384];
const HERO_WIDTHS = [828, 1080];
const FORMATS = ["image/avif", "image/webp"]; // what modern browsers negotiate

export async function warmImages(mainImage: string | null | undefined, gallery: string[] = []) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!mainImage) return;

  const jobs: [string, number][] = [
    ...CARD_WIDTHS.map((w) => [mainImage, w] as [string, number]),
    ...HERO_WIDTHS.map((w) => [mainImage, w] as [string, number]),
    // The next gallery photo is the likeliest second view.
    ...(gallery[1] ? HERO_WIDTHS.slice(0, 1).map((w) => [gallery[1], w] as [string, number]) : []),
  ];

  await Promise.all(
    jobs.flatMap(([src, w]) =>
      FORMATS.map((accept) =>
        // CDN photos are resized by the CDN itself (its variant cache), others by next/image.
        (isCdnImage(src) || base) && fetch(isCdnImage(src) ? cdnLoader({ src, width: w, quality: 75 }) : `${base}/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`, {
          headers: { Accept: `${accept},image/*;q=0.8` },
          signal: AbortSignal.timeout(20_000),
        })
          .then((r) => r.arrayBuffer())
          .catch(() => { /* best effort — a miss just means a normal first load */ })
      )
    )
  );
}
