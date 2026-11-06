/**
 * Saving uploads into the media library — the one place that decides where
 * files go:
 *   MEDIA_DRIVER=cdn → the site's CDN (processing, AI alt text, private
 *                      signed links); raw files are sent once, the CDN does
 *                      the work. The CDN is the storage: if it can't be
 *                      reached the upload fails with a "try again" message —
 *                      files never land on this server, so the CDN can move
 *                      to its own storage server at any time.
 *                      (MEDIA_LOCAL_FALLBACK=1 restores the old local fallback.)
 *   otherwise        → local storage (lib/storage), for development.
 *
 * File names are SEO-friendly: a photo called "IMG_2041.jpg" uploaded for an
 * iPhone 15 Pro ad is stored as iphone-15-pro-<unique id>.webp (the CDN adds
 * the id).
 */
import mongoose from "mongoose";
import Media, { type IMedia, type MediaFolder } from "@/models/Media";
import { storeImage, storeVideoFile, UploadError } from "@/lib/storage";
import { cdnEnabled, cdnUpload, cdnDelete, CdnUnavailable } from "@/lib/cdn-client";
import { withBasePath } from "@/lib/base-path";

export type SaveOptions = {
  folder: MediaFolder;
  isPrivate: boolean;
  userId: string;
  context?: string | null;        // e.g. "Samsung Galaxy S24 Ultra" — helps the AI and the fallback alt
  aiMode?: "async" | "sync" | "off";
  allowNonImages?: boolean;       // videos/PDFs (admin only)
};

const titleFromName = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

// Camera / messenger / screenshot names say nothing about the picture.
const GENERIC_NAME = /^(img|image|dsc|dcim|pxl|photo|pic|picture|screenshot|screen shot|whatsapp|wa\d|signal|telegram|snapchat|mmexport|camera|upload|file|blob|download|untitled|\d)/i;

/** The name the file is stored under: what it shows (the ad's model) beats "IMG_2041". */
export function storageName(original: string, context?: string | null): string {
  const ext = (original.match(/\.[a-z0-9]{2,5}$/i)?.[0] || ".jpg").toLowerCase();
  const stem = titleFromName(original);
  const ctx = (context || "").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (ctx && (!stem || GENERIC_NAME.test(stem) || stem.length < 3)) return `${ctx}${ext}`;
  return original || `upload${ext}`;
}

/** Alt text when the AI hasn't (or won't) write one: better than nothing for SEO and screen readers. */
function fallbackAlt(o: SaveOptions, name: string, i: number) {
  const ctx = (o.context || "").trim();
  if (ctx) return o.folder === "listings" ? `${ctx} — photo ${i + 1}` : ctx;
  const t = titleFromName(name);
  return /^(img|image|dsc|pxl|photo|screenshot|whatsapp)[\s_-]*\d/i.test(t) ? "" : t;
}

export async function saveUploads(files: File[], o: SaveOptions): Promise<{ docs: IMedia[]; failed: string[] }> {
  const failed: string[] = [];
  const docs: IMedia[] = [];

  if (cdnEnabled()) {
    try {
      const buffers = await Promise.all(files.map(async (f) => ({ buffer: Buffer.from(await f.arrayBuffer()), name: storageName(f.name || "upload", o.context), type: f.type })));
      const { items, failed: cdnFailed } = await cdnUpload(buffers, { folder: o.folder, isPrivate: o.isPrivate, context: o.context, ai: o.aiMode });
      failed.push(...cdnFailed.map((f) => `${f.name}: ${f.error}`));
      for (const [i, it] of items.entries()) {
        if (it.kind !== "image" && !o.allowNonImages) {
          await cdnDelete(it.key).catch(() => {});
          failed.push(`${it.originalName || "file"}: only images can be uploaded here`);
          continue;
        }
        const _id = new mongoose.Types.ObjectId();
        // Private files have no public URL: /media/p/<id> checks who's asking, then
        // redirects to a short-lived signed CDN link.
        const url = it.isPrivate ? withBasePath(`/media/p/${_id}`) : it.url!;
        const alt = it.alt || fallbackAlt(o, it.originalName || "", i);
        docs.push(await Media.create({
          _id, url, thumbUrl: it.isPrivate ? url : it.thumbUrl || url, key: it.key, driver: "cdn",
          mime: it.mime, kind: it.kind, width: it.width || 0, height: it.height || 0, sizeBytes: it.sizeBytes,
          originalName: (it.originalName || "").slice(0, 200), title: it.title || titleFromName(it.originalName || ""),
          alt, altSource: it.alt ? "ai" : "auto", caption: it.caption || "", aiStatus: it.ai,
          placeholder: it.placeholder || "", color: it.color || "",
          folder: o.folder, isPrivate: it.isPrivate, uploadedBy: o.userId,
        }));
      }
      return { docs, failed };
    } catch (e) {
      // The CDN refused the file itself (not an image/video, too big…): tell
      // the person why, instead of a generic server error.
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 500) {
        const why = /unsupported/i.test((e as Error).message)
          ? "not a supported image or video (use JPG, PNG, WebP, HEIC or MP4)"
          : (e as Error).message;
        return { docs, failed: files.map((f) => `${f.name || "file"}: ${why}`) };
      }
      if (!(e instanceof CdnUnavailable)) throw e;
      if (process.env.MEDIA_LOCAL_FALLBACK !== "1") {
        console.error("[media] CDN unreachable — upload refused:", (e as Error).message);
        return { docs, failed: files.map((f) => `${f.name || "file"}: photo storage is busy right now — please try again in a minute`) };
      }
      console.warn("[media] CDN unreachable — saving locally instead:", (e as Error).message);
    }
  }

  // Local driver (images & videos).
  for (const [i, f] of files.entries()) {
    try {
      const isVideo = /^video\//.test(f.type) || /\.(mp4|webm|mov)$/i.test(f.name);
      if (isVideo && o.allowNonImages) {
        const stored = await storeVideoFile(Buffer.from(await f.arrayBuffer()), {
          folder: o.folder, isPrivate: o.isPrivate, originalName: f.name, mime: f.type,
        });
        docs.push(await Media.create({
          ...stored, kind: "video", folder: o.folder, isPrivate: o.isPrivate, originalName: f.name.slice(0, 200),
          title: titleFromName(f.name), alt: `${o.context || "Listing"} video`, altSource: "auto", aiStatus: "skipped",
          uploadedBy: o.userId,
        }));
        continue;
      }
      if (!/^image\//.test(f.type) && !/\.(heic|heif|avif)$/i.test(f.name)) throw new UploadError("Only images or videos can be stored");
      const stored = await storeImage(Buffer.from(await f.arrayBuffer()), {
        folder: o.folder, isPrivate: o.isPrivate,
        // "IMG_2041.jpg" for a Corolla ad is stored as toyota-corolla-2021-….webp
        name: `${storageName(f.name || "upload", o.context)}${i > 0 ? `-${i + 1}` : ""}`,
      });
      docs.push(await Media.create({
        ...stored, kind: "image", folder: o.folder, isPrivate: o.isPrivate, originalName: f.name.slice(0, 200),
        title: titleFromName(f.name), alt: fallbackAlt(o, f.name, i), altSource: "auto", aiStatus: "skipped",
        uploadedBy: o.userId,
      }));
    } catch (e) {
      failed.push(e instanceof UploadError ? `${f.name}: ${e.message}` : `${f.name}: upload failed`);
      if (!(e instanceof UploadError)) console.error("[media] local store failed:", e);
    }
  }
  return { docs, failed };
}
