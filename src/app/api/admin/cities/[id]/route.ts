import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";
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

    const city = await City.findById(id);
    if (!city) return NextResponse.json({ success: false, message: "City not found" }, { status: 404 });

    if (body.name && body.name.trim() !== city.name) {
      city.name = body.name.trim();
      let baseSlug = slugify(body.name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 0;
      while (await City.findOne({ slug, _id: { $ne: city._id } })) {
        count++;
        slug = `${baseSlug}-${count}`;
      }
      const oldSlug = city.slug;
      city.slug = slug;
      // keep denormalized area.citySlug in sync
      if (oldSlug !== slug) await Area.updateMany({ cityId: city._id }, { citySlug: slug });
    }
    if (body.stateName !== undefined) city.stateName = body.stateName || null;
    if (body.latitude !== undefined) city.latitude = body.latitude !== "" ? Number(body.latitude) : null;
    if (body.longitude !== undefined) city.longitude = body.longitude !== "" ? Number(body.longitude) : null;
    if (body.image !== undefined) city.image = body.image || null;
    if (body.featuredImage !== undefined) city.featuredImage = body.featuredImage || null;
    if (body.content !== undefined) city.content = body.content || null;
    if (body.order !== undefined) city.order = Number(body.order);
    if (body.isActive !== undefined) city.isActive = Boolean(body.isActive);

    await city.save();
    expireTag("locations"); // catalog: places map + picker
    return NextResponse.json({ success: true, message: "City updated", data: city });
  } catch (error: any) {
    console.error("PUT admin city:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();

    await Area.deleteMany({ cityId: id }); // cascade areas
    await City.deleteOne({ _id: id });
    expireTag("locations"); // catalog: places map + picker
    return NextResponse.json({ success: true, message: "City and its areas deleted" });
  } catch (error: any) {
    console.error("DELETE admin city:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
