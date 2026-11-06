import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Media, { MEDIA_FOLDERS } from "@/models/Media";
import User from "@/models/User";
import { toMediaItem } from "@/lib/media";

/**
 * GET /api/media — the media library.
 * Members see their own uploads; admins see everything.
 * Query: folder, q (title/file name), page, limit (≤60), private=1 (include private).
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const isAdmin = session.role === "admin";

  const filter: Record<string, any> = {};
  if (!isAdmin || sp.get("mine") === "1") filter.uploadedBy = session.userId;
  const folder = sp.get("folder");
  if (folder && (MEDIA_FOLDERS as readonly string[]).includes(folder)) filter.folder = folder;
  if (sp.get("private") !== "1") filter.isPrivate = false;
  const q = (sp.get("q") || "").trim().slice(0, 60);
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { originalName: rx }, { alt: rx }];
  }

  const limit = Math.min(60, Math.max(1, Number(sp.get("limit")) || 40));
  const page = Math.max(1, Number(sp.get("page")) || 1);

  await dbConnect();
  const [docs, total, usage] = await Promise.all([
    Media.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate({ path: "uploadedBy", model: User, select: "name" }).lean(),
    Media.countDocuments(filter),
    isAdmin
      ? Media.aggregate([{ $group: { _id: null, bytes: { $sum: "$sizeBytes" }, n: { $sum: 1 } } }])
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    success: true,
    data: docs.map(toMediaItem),
    total, page, pages: Math.max(1, Math.ceil(total / limit)),
    ...(isAdmin && usage[0] ? { storage: { files: usage[0].n, bytes: usage[0].bytes } } : {}),
  });
}
