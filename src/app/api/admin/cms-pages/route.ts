import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import CmsPage from "@/models/CmsPage";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";
import { expireTag } from "@/lib/catalog";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    const pages = await CmsPage.find({}).sort({ sequence: 1, title: 1 }).lean();
    return NextResponse.json({ success: true, data: pages });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const { title, content, seoTitle, seoDescription, status, showInFooter, sequence } = await req.json();
    if (!title) return NextResponse.json({ success: false, message: "Title required" }, { status: 400 });
    await dbConnect();

    let baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let n = 0;
    while (await CmsPage.findOne({ slug })) { n++; slug = `${baseSlug}-${n}`; }

    const page = await CmsPage.create({
      title: title.trim(), slug, content: content || "",
      seoTitle: seoTitle || null, seoDescription: seoDescription || null,
      status: status !== undefined ? Boolean(status) : true,
      showInFooter: showInFooter !== undefined ? Boolean(showInFooter) : true,
      sequence: sequence != null ? Number(sequence) : 0,
    });
    expireTag("cms");
    return NextResponse.json({ success: true, message: "Page created", data: page });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
