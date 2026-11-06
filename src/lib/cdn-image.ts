/**
 * next/image loader for CDN images: the CDN resizes and picks AVIF/WebP itself
 * (/t/w_384,q_75/…), so card and gallery photos never touch this server's
 * image optimiser. Other images keep the default loader.
 */
import type { ImageLoader } from "next/image";
import { withBasePath } from "@/lib/base-path";
import { VERTICAL } from "@/vertical";

/** Shown when an ad has no photo, or its photo fails to load. */
// "No photo" picture in the vertical's shape (public/placeholders/car.svg, bike.svg).
export const PLACEHOLDER_IMG = withBasePath(VERTICAL.placeholderImage);

const CDN = (process.env.NEXT_PUBLIC_CDN_URL || "").replace(/\/+$/, "");
// Must match the CDN's whitelist (cdn/src/config.ts → transformWidths).
const WIDTHS = [48, 64, 96, 128, 160, 256, 320, 384, 480, 640, 750, 828, 960, 1080, 1200, 1440, 1920];

export const isCdnImage = (src: unknown): src is string => !!CDN && typeof src === "string" && src.startsWith(`${CDN}/u/`);

export const cdnLoader: ImageLoader = ({ src, width, quality }) => {
  const w = WIDTHS.find((x) => x >= width) ?? WIDTHS[WIDTHS.length - 1];
  return `${CDN}/t/w_${w},q_${Math.min(90, Math.max(40, quality || 75))}/${src.slice(CDN.length + 3)}`;
};

// The site's own media library (storage/media — the local driver): photos are
// served from their real, named path (/media/listings/2026/09/toyota-corolla-….webp),
// never /_next/image?url=…, so "open image in new tab" shows a proper URL. Small
// sizes use the 480px thumbnail stored next to each photo.
const LOCAL_MEDIA = new RegExp(`^${withBasePath("/media/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!private/|p/)[^?#]+\\.webp$`);
export const isLocalMedia = (src: unknown): src is string => typeof src === "string" && LOCAL_MEDIA.test(src);
export const localMediaLoader: ImageLoader = ({ src, width }) =>
  width <= 480 && !src.endsWith("-thumb.webp") ? src.replace(/\.webp$/, "-thumb.webp") : src;

/** `loader` prop value for a src: the CDN loader for CDN images, else the default. */
export const loaderFor = (src: unknown): ImageLoader | undefined =>
  isCdnImage(src) ? cdnLoader : isLocalMedia(src) ? localMediaLoader : undefined;

/**
 * next/image props for a photo, spread onto <Image>:
 *   CDN photos         → resized by the CDN (clean, named URLs that open in a new tab)
 *   media-library photos stored here (development) → their own file path, thumbnail when small
 *   photos on other sites (imported ads not yet copied to the CDN) → loaded by
 *                        the visitor's browser as they are: our server can't
 *                        always fetch them (OLX refuses datacenter IPs, so the
 *                        optimiser answered 403 and the photo never showed)
 *   SVGs               → as they are (nothing to optimise)
 *   anything else      → next/image's own optimiser
 */
export function imageProps(src: unknown): { loader?: ImageLoader; unoptimized?: boolean } {
  if (isCdnImage(src)) return { loader: cdnLoader };
  if (isLocalMedia(src)) return { loader: localMediaLoader };
  if (typeof src === "string" && (/^https?:\/\//i.test(src) || /\.svg($|\?)/i.test(src))) return { unoptimized: true };
  return {};
}
