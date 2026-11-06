import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import CmsPage from "@/models/CmsPage";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";
import { expireTag } from "@/lib/catalog";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;
    const body = await req.json();
    await dbConnect();

    const page = await CmsPage.findById(id);
    if (!page) return NextResponse.json({ success: false, message: "Page not found" }, { status: 404 });

    if (body.title && body.title.trim() !== page.title) {
      page.title = body.title.trim();
      let baseSlug = slugify(body.title, { lower: true, strict: true });
      let slug = baseSlug;
      let n = 0;
      while (await CmsPage.findOne({ slug, _id: { $ne: page._id } })) { n++; slug = `${baseSlug}-${n}`; }
      page.slug = slug;
    }
    if (body.content !== undefined) page.content = body.content;
    if (body.seoTitle !== undefined) page.seoTitle = body.seoTitle || null;
    if (body.seoDescription !== undefined) page.seoDescription = body.seoDescription || null;
    if (body.status !== undefined) page.status = Boolean(body.status);
    if (body.showInFooter !== undefined) page.showInFooter = Boolean(body.showInFooter);
    if (body.sequence !== undefined) page.sequence = Number(body.sequence);

    await page.save();
    expireTag("cms");
    return NextResponse.json({ success: true, message: "Page updated", data: page });
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
    await CmsPage.deleteOne({ _id: id });
    expireTag("cms");
    return NextResponse.json({ success: true, message: "Page deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
