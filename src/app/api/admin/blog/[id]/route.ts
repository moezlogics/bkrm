import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;
    const b = await req.json();
    await dbConnect();
    const post = await BlogPost.findById(id);
    if (!post) return NextResponse.json({ success: false, message: "Post not found" }, { status: 404 });

    if (b.title && b.title.trim() !== post.title) {
      post.title = b.title.trim();
      let baseSlug = slugify(b.title, { lower: true, strict: true });
      let slug = baseSlug;
      let n = 0;
      while (await BlogPost.findOne({ slug, _id: { $ne: post._id } })) { n++; slug = `${baseSlug}-${n}`; }
      post.slug = slug;
    }
    if (b.excerpt !== undefined) post.excerpt = b.excerpt || null;
    if (b.content !== undefined) post.content = b.content;
    if (b.coverImage !== undefined) post.coverImage = b.coverImage || null;
    if (b.category !== undefined) post.category = b.category || "General";
    if (b.seoTitle !== undefined) post.seoTitle = b.seoTitle || null;
    if (b.seoDescription !== undefined) post.seoDescription = b.seoDescription || null;
    if (b.status !== undefined) {
      const newStatus = b.status === "published" ? "published" : "draft";
      if (newStatus === "published" && !post.publishedAt) post.publishedAt = new Date();
      post.status = newStatus;
    }
    await post.save();
    return NextResponse.json({ success: true, message: "Post updated", data: post });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    await BlogPost.deleteOne({ _id: id });
    return NextResponse.json({ success: true, message: "Post deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
