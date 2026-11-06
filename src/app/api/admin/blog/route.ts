import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    const posts = await BlogPost.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: posts });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const b = await req.json();
    if (!b.title) return NextResponse.json({ success: false, message: "Title required" }, { status: 400 });
    await dbConnect();

    let baseSlug = slugify(b.title, { lower: true, strict: true });
    let slug = baseSlug;
    let n = 0;
    while (await BlogPost.findOne({ slug })) { n++; slug = `${baseSlug}-${n}`; }

    const status = b.status === "published" ? "published" : "draft";
    const post = await BlogPost.create({
      title: b.title.trim(), slug, excerpt: b.excerpt || null, content: b.content || "",
      coverImage: b.coverImage || null, category: b.category || "General",
      seoTitle: b.seoTitle || null, seoDescription: b.seoDescription || null,
      status, publishedAt: status === "published" ? new Date() : null,
    });
    return NextResponse.json({ success: true, message: "Post created", data: post });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
