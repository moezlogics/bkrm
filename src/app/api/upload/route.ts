import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { MEDIA_FOLDERS, type MediaFolder } from "@/models/Media";
import { saveUploads } from "@/lib/media-store";
import { toMediaItem } from "@/lib/media";

// Folders a regular member may upload into; the rest are admin-only (site content).
const USER_FOLDERS = new Set<MediaFolder>(["general", "listings", "profile", "shop", "verification", "payments"]);
// Never publicly readable: identity documents and payment proofs.
const PRIVATE_FOLDERS = new Set<MediaFolder>(["verification", "payments"]);
const MAX_FILES = 12;

// Simple per-user burst limit (per server instance) — stops a script from
// filling the disk through one account.
const recent = new Map<string, number[]>();
function allow(userId: string, n: number) {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter((t) => now - t < 10 * 60_000);
  if (list.length + n > 120) return false;
  for (let i = 0; i < n; i++) list.push(now);
  recent.set(userId, list);
  return true;
}

/**
 * POST /api/upload — multipart; files under "files" (multiple), "image",
 * "media" or "file". Optional "folder" (media-library folder) and "context"
 * (what the image shows, e.g. the ad's model — feeds the AI alt text).
 * Files go to the site's CDN (lib/media-store), or local storage without it.
 * Response: { success, data: firstItem, items: [...] } — `data.url` keeps the
 * shape older callers read.
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;
    const isAdmin = session.role === "admin";

    const form = await req.formData();
    const files = ["files", "image", "media", "file"].flatMap((k) => form.getAll(k)).filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return NextResponse.json({ success: false, message: "Choose an image to upload" }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ success: false, message: `Upload up to ${MAX_FILES} images at a time` }, { status: 400 });

    const asked = String(form.get("folder") || req.nextUrl.searchParams.get("folder") || "general") as MediaFolder;
    const folder: MediaFolder = (MEDIA_FOLDERS as readonly string[]).includes(asked) && (isAdmin || USER_FOLDERS.has(asked)) ? asked : "general";
    const isPrivate = PRIVATE_FOLDERS.has(folder);

    if (!isAdmin && !allow(session.userId, files.length)) {
      return NextResponse.json({ success: false, message: "Too many uploads — please wait a few minutes" }, { status: 429 });
    }

    await dbConnect();
    const context = String(form.get("context") || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
    // Admins see AI alt text immediately for site content; members' photos get it
    // in the background so uploading stays fast.
    const aiMode = isAdmin && !["listings", "profile"].includes(folder) ? "sync" : "async";
    const { docs, failed } = await saveUploads(files, {
      folder, isPrivate, userId: session.userId, context, aiMode, allowNonImages: isAdmin || folder === "listings",
    });
    const items = docs.map(toMediaItem);

    if (!items.length) return NextResponse.json({ success: false, message: failed[0] || "Upload failed", failed }, { status: 400 });
    return NextResponse.json({ success: true, data: items[0], items, failed });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ success: false, message: "Upload failed" }, { status: 500 });
  }
}
