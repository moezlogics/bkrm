import { readFile, stat } from "fs/promises";
import { NextResponse } from "next/server";
import { resolveKey } from "@/lib/storage";
import { getServerSession } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Media from "@/models/Media";
import mongoose from "mongoose";
import { cdnSign } from "@/lib/cdn-client";

/**
 * Serves media-library files. Public files are content-addressed (a new upload
 * always gets a new name), so they cache for a year. Files under private/
 * (ID documents, payment proofs) are only served to their uploader and admins.
 *
 * /media/p/<id> is a private file on the CDN: after the same owner/admin check
 * it redirects to a short-lived signed CDN link (the CDN never exposes it otherwise).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  if (parts[0] === "p" && parts.length === 2) return privateCdn(parts[1]);
  const key = parts.join("/");
  const abs = resolveKey(key);
  if (!abs || !/\.webp$/.test(abs)) return new NextResponse("Not found", { status: 404 });

  const isPrivate = parts[0] === "private";
  if (isPrivate) {
    const session = await getServerSession();
    if (!session) return new NextResponse("Not found", { status: 404 });
    if (session.role !== "admin") {
      await dbConnect();
      const mainKey = key.replace(/-thumb\.webp$/, ".webp");
      const owner = await Media.exists({ key: mainKey, uploadedBy: session.userId });
      if (!owner) return new NextResponse("Not found", { status: 404 });
    }
  }

  try {
    const [buf, st] = await Promise.all([readFile(abs), stat(abs)]);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(st.size),
        "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

async function privateCdn(id: string) {
  const none = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!mongoose.isValidObjectId(id)) return none();
  const session = await getServerSession();
  if (!session) return none();
  await dbConnect();
  const m: any = await Media.findById(id).select("key driver uploadedBy isPrivate").lean();
  if (!m || m.driver !== "cdn") return none();
  if (session.role !== "admin" && String(m.uploadedBy) !== session.userId) return none();
  try {
    const url = await cdnSign(m.key, 300);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return new NextResponse("File temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
