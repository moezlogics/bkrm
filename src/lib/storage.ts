/**
 * Image storage for the media library.
 *
 * Every upload is decoded and re-encoded by sharp before it is stored:
 * - rejects anything that isn't really an image (renamed files, scripts);
 * - auto-rotates phone photos and strips EXIF — which also removes the GPS
 *   location a phone camera writes into every picture;
 * - resizes to a sane maximum and converts to WebP (a 4 MB phone photo lands
 *   at ~150-300 KB), plus a small thumbnail for grids.
 *
 * This is the LOCAL driver (files under MEDIA_DIR, default ./storage/media,
 * served by app/media/[...path]). With MEDIA_DRIVER=cdn uploads go to the
 * the site's CDN instead (lib/media-store) and this is only the fallback for
 * when the CDN can't be reached.
 */
import sharp, { type Metadata } from "sharp";
import path from "path";
import { randomBytes } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import { cdnDelete } from "@/lib/cdn-client";
import { withBasePath } from "@/lib/base-path";

// turbopackIgnore: these are runtime paths, not files to bundle/trace.
export const MEDIA_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "media"));
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff", "svg"]);

export interface StoredImage {
  url: string;
  thumbUrl: string;
  key: string;
  driver: "local" | "cdn";
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
}

type Profile = { max: number; quality: number };
// Branding (logos) keeps more detail and never gets squashed by photo settings.
const PROFILES: Record<string, Profile> = {
  branding: { max: 1200, quality: 92 },
  verification: { max: 2000, quality: 88 }, // ID documents must stay legible
  payments: { max: 2000, quality: 85 },
  default: { max: 1600, quality: 82 },
};

export class UploadError extends Error {}

/** "Toyota Corolla 2021.jpg" → "toyota-corolla-2021": readable, URL-safe file names (as the CDN names them). */
const fileStem = (name?: string | null) =>
  String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

export async function storeImage(
  input: Buffer,
  // name: what the photo shows (the ad's title) — becomes part of its public file name.
  opts: { folder: string; isPrivate?: boolean; name?: string | null }
): Promise<StoredImage> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new UploadError("Image is larger than 15 MB");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 60e6 }).metadata();
  } catch {
    throw new UploadError("This file isn't a supported image");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new UploadError("Only JPG, PNG, WebP, GIF, AVIF or HEIC images are allowed");

  const profile = PROFILES[opts.folder] || PROFILES.default;
  // SVG logos are rasterised (serving user SVG same-origin is an XSS risk).
  const base = () => sharp(input, { limitInputPixels: 60e6, density: meta.format === "svg" ? 300 : undefined }).rotate();

  const main = await base()
    .resize({ width: profile.max, height: profile.max, fit: "inside", withoutEnlargement: true })
    .webp({ quality: profile.quality, alphaQuality: 100 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer();

  // Public files get a descriptive name (SEO, and a sensible URL in a new tab);
  // private documents keep an opaque one.
  const stem = opts.isPrivate ? "" : fileStem(opts.name);
  const id = `${stem ? `${stem}-` : ""}${Date.now().toString(36)}${randomBytes(opts.isPrivate ? 6 : 3).toString("hex")}`;
  const now = new Date();
  const dir = [opts.isPrivate ? "private" : null, safeSeg(opts.folder), String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0")]
    .filter(Boolean)
    .join("/");
  const key = `${dir}/${id}.webp`;
  const thumbKey = `${dir}/${id}-thumb.webp`;

  await mkdir(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, dir), { recursive: true });
  await Promise.all([writeFile(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, key), main.data), writeFile(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, thumbKey), thumb)]);
  return {
    url: withBasePath(`/media/${key}`), thumbUrl: withBasePath(`/media/${thumbKey}`), key, driver: "local",
    mime: "image/webp", width: main.info.width, height: main.info.height, sizeBytes: main.data.byteLength,
  };
}

export async function storeVideoFile(
  input: Buffer,
  opts: { folder: string; isPrivate?: boolean; originalName?: string; mime?: string }
): Promise<StoredImage> {
  const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
  if (input.byteLength > MAX_VIDEO_BYTES) throw new UploadError("Video is larger than 30 MB");

  const ext = (opts.originalName?.match(/\.([a-z0-9]+)$/i)?.[1] || "mp4").toLowerCase();
  const id = `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  const now = new Date();
  const dir = [opts.isPrivate ? "private" : null, safeSeg(opts.folder), String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0")]
    .filter(Boolean)
    .join("/");
  const key = `${dir}/${id}.${ext}`;

  await mkdir(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, dir), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, key), input);

  return {
    url: withBasePath(`/media/${key}`),
    thumbUrl: withBasePath(`/media/${key}`),
    key,
    driver: "local",
    mime: opts.mime || (ext === "webm" ? "video/webm" : "video/mp4"),
    width: 0,
    height: 0,
    sizeBytes: input.byteLength,
  };
}

export async function deleteStored(m: { key: string; driver: string }) {
  if (m.driver === "cdn") {
    await cdnDelete(m.key).catch((e) => console.warn("[media] CDN delete failed:", e?.message));
    return;
  }
  const abs = resolveKey(m.key);
  if (!abs) return;
  await Promise.all([unlink(abs).catch(() => {}), unlink(abs.replace(/\.webp$/, "-thumb.webp")).catch(() => {})]);
}

/** Absolute path for a storage key, or null if it would escape MEDIA_ROOT. */
export function resolveKey(key: string): string | null {
  const parts = key.split("/");
  if (!parts.length || parts.some((p) => !/^[a-z0-9][a-z0-9._-]*$/i.test(p) || p.includes(".."))) return null;
  const abs = path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, ...parts);
  return abs.startsWith(MEDIA_ROOT + path.sep) ? abs : null;
}

const safeSeg = (s: string) => (s || "general").toLowerCase().replace(/[^a-z0-9-]/g, "") || "general";
