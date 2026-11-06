/**
 * Client for the site's CDN (./cdn — deployed on its own subdomain).
 *
 * Server-side only: uses the API key. Every upload on the site goes through
 * here when MEDIA_DRIVER=cdn (see lib/storage + app/api/upload).
 *
 * Env: CDN_URL (server-to-server base), NEXT_PUBLIC_CDN_URL (public base),
 *      CDN_API_KEY, CDN_SIGNING_SECRET.
 */
import { createHmac, timingSafeEqual } from "crypto";

const BASE = (process.env.CDN_URL || process.env.CDN_BASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.CDN_API_KEY || "";

export const cdnEnabled = () => process.env.MEDIA_DRIVER === "cdn" && !!BASE && !!KEY;

export type CdnItem = {
  key: string;
  url: string | null;          // null for private files
  thumbUrl: string | null;
  kind: "image" | "video" | "pdf";
  mime: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  folder: string;
  isPrivate: boolean;
  placeholder: string | null;
  color: string | null;
  alt: string | null;
  title: string | null;
  caption: string | null;
  ai: "pending" | "done" | "failed" | "skipped";
  originalName: string | null;
};

export class CdnUnavailable extends Error {}

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), "x-cdn-key": KEY },
      signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
    });
  } catch (e) {
    throw new CdnUnavailable(`CDN unreachable: ${(e as Error).message}`);
  }
  // 5xx — the CDN (or the proxy in front of it, e.g. Cloudflare 52x) answered
  // but isn't working: that's "unavailable" too, so uploads fall back to local
  // storage instead of failing. 4xx still means the file itself was refused.
  if (r.status >= 500) {
    const err = new CdnUnavailable(`CDN error ${r.status}`) as CdnUnavailable & { status?: number };
    err.status = r.status;
    throw err;
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) {
    const err = new Error(j.error || `CDN error ${r.status}`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return j as T;
}

/** Upload one or more files in one request. */
export async function cdnUpload(
  files: { buffer: Buffer; name: string; type: string }[],
  o: { folder: string; isPrivate?: boolean; context?: string | null; ai?: "async" | "sync" | "off" }
): Promise<{ items: CdnItem[]; failed: { name: string; error: string }[] }> {
  const fd = new FormData();
  for (const f of files) fd.append("files", new Blob([new Uint8Array(f.buffer)], { type: f.type || "application/octet-stream" }), f.name);
  fd.append("folder", o.folder);
  if (o.isPrivate) fd.append("private", "1");
  if (o.context) fd.append("context", o.context.slice(0, 200));
  fd.append("ai", o.ai || "async");
  const j = await call<{ items: CdnItem[]; failed?: { name: string; error: string }[] }>("/api/media/upload", {
    method: "POST", body: fd, timeoutMs: o.ai === "sync" ? 90_000 : 60_000,
  });
  return { items: j.items, failed: j.failed || [] };
}

export async function cdnDelete(key: string) {
  await call("/api/media", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
}

export async function cdnPatchMeta(key: string, patch: { alt?: string; title?: string; caption?: string }) {
  return call<{ data: CdnItem }>("/api/media/meta", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...patch }) });
}

export async function cdnRegenerateAi(key: string, context?: string | null) {
  const j = await call<{ data: CdnItem }>("/api/media/ai", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, context }), timeoutMs: 60_000,
  });
  return j.data;
}

/** Short-lived link to a private file (ID document, payment proof). */
export async function cdnSign(key: string, ttlSeconds = 300): Promise<string> {
  const j = await call<{ data: { url: string } }>("/api/media/sign", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ttl: ttlSeconds }), timeoutMs: 10_000,
  });
  return j.data.url;
}

/** Verify a webhook from the CDN (HMAC-SHA256 of the raw body, hex). */
export function verifyCdnSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CDN_SIGNING_SECRET || "";
  if (!secret || !signature) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ── Compatibility for the legacy multipart ad endpoints (api/ads) ──

export interface CdnUploadResponse {
  success: boolean;
  data: { url: string; thumbUrl: string; filename: string; width: number; height: number; sizeBytes: number; alt: string; title: string };
}

export async function uploadToCdn(file: Buffer, name: string, _field: "image" | "media" | "files" = "image", mimeType = "application/octet-stream"): Promise<CdnUploadResponse> {
  const { items } = await cdnUpload([{ buffer: file, name, type: mimeType }], { folder: "listings" });
  const it = items[0];
  return {
    success: !!it?.url,
    data: {
      url: it?.url || "", thumbUrl: it?.thumbUrl || "", filename: it?.key || "", width: it?.width || 0, height: it?.height || 0,
      sizeBytes: it?.sizeBytes || 0, alt: it?.alt || "", title: it?.title || "",
    },
  };
}

export async function deleteFromCdn(keyOrFilename: string): Promise<void> {
  await cdnDelete(keyOrFilename);
}
