import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Area from "@/models/Area";
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

    const area = await Area.findById(id);
    if (!area) return NextResponse.json({ success: false, message: "Area not found" }, { status: 404 });

    if (body.name && body.name.trim() !== area.name) {
      area.name = body.name.trim();
      let baseSlug = slugify(body.name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 0;
      while (await Area.findOne({ citySlug: area.citySlug, slug, _id: { $ne: area._id } })) {
        count++;
        slug = `${baseSlug}-${count}`;
      }
      area.slug = slug;
    }
    if (body.latitude !== undefined) area.latitude = body.latitude !== "" ? Number(body.latitude) : null;
    if (body.longitude !== undefined) area.longitude = body.longitude !== "" ? Number(body.longitude) : null;
    if (body.content !== undefined) area.content = body.content || null;
    if (body.featuredImage !== undefined) area.featuredImage = body.featuredImage || null;
    if (body.isActive !== undefined) area.isActive = Boolean(body.isActive);

    await area.save();
    expireTag("locations"); // catalog: places map + picker
    return NextResponse.json({ success: true, message: "Area updated", data: area });
  } catch (error: any) {
    console.error("PUT admin area:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    await Area.deleteOne({ _id: id });
    expireTag("locations"); // catalog: places map + picker
    return NextResponse.json({ success: true, message: "Area deleted" });
  } catch (error: any) {
    console.error("DELETE admin area:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
