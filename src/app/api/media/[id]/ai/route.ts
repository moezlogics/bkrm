import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Media from "@/models/Media";
import { cdnRegenerateAi } from "@/lib/cdn-client";
import { toMediaItem } from "@/lib/media";

/** POST /api/media/:id/ai — (re)write the alt text, title and caption with AI now. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  await dbConnect();
  const doc = await Media.findById(id);
  if (!doc || (session.role !== "admin" && String(doc.uploadedBy) !== session.userId)) {
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  }
  if (doc.driver !== "cdn") return NextResponse.json({ success: false, message: "AI descriptions need the CDN (this file is stored locally)" }, { status: 400 });
  if (doc.isPrivate || doc.kind !== "image") return NextResponse.json({ success: false, message: "AI isn't used for private files or videos" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  try {
    const r = await cdnRegenerateAi(doc.key, typeof body.context === "string" ? body.context.slice(0, 200) : doc.title);
    doc.alt = r.alt || doc.alt;
    doc.title = r.title || doc.title;
    doc.caption = r.caption || doc.caption;
    doc.altSource = "ai";
    doc.aiStatus = "done";
    await doc.save();
    return NextResponse.json({ success: true, data: toMediaItem(doc) });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || "The AI couldn't describe this image" }, { status: 502 });
  }
}
