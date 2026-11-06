"use client";

import type { MediaItem } from "@/lib/media";

/**
 * Browser-side upload helpers.
 *
 * Phone cameras produce 3-8 MB photos; pushing those over 4G is the slowest
 * part of posting an ad. Photos are downscaled in the browser first (the
 * server re-encodes anyway), so a typical upload is ~300 KB instead of 5 MB.
 * PNG/GIF/SVG (logos, transparency) are sent untouched.
 */
export async function shrinkForUpload(file: File, max = 1800, quality = 0.86): Promise<File> {
  const photo = /^image\/(jpe?g|heic|heif|webp)$/i.test(file.type);
  if (!photo || file.size < 450_000 || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // undecodable in this browser (e.g. HEIC outside Safari) — let the server handle it
  }
}

export type UploadResult = { items: MediaItem[]; failed: string[] };

/** Upload files to the media library with progress (0-1). */
export async function uploadImages(
  files: File[],
  opts: { folder?: string; onProgress?: (p: number) => void; context?: string } = {}
): Promise<UploadResult> {
  const ready = await Promise.all(files.map((f) => (opts.folder === "branding" ? f : shrinkForUpload(f))));
  const fd = new FormData();
  ready.forEach((f) => fd.append("files", f));
  fd.append("folder", opts.folder || "general");
  if (opts.context) fd.append("context", opts.context.slice(0, 200));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let j: any = null;
      try { j = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status === 401) return reject(new Error("Please log in again to upload"));
      if (!j?.success) return reject(new Error(j?.message || "Upload failed"));
      resolve({ items: j.items || (j.data ? [j.data] : []), failed: j.failed || [] });
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again"));
    xhr.send(fd);
  });
}

export const formatBytes = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
