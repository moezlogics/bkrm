import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";
import Area from "@/models/Area";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";
import { expireTag } from "@/lib/catalog";

// GET /api/admin/cities → all cities (with area counts) for admin
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();

    const cities = await City.find({}).sort({ order: 1, name: 1 }).lean();
    const counts = await Area.aggregate([
      { $group: { _id: "$cityId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [c._id?.toString(), c.count]));

    const data = cities.map((c: any) => ({
      ...c,
      _id: c._id.toString(),
      areaCount: countMap.get(c._id.toString()) || 0,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("GET admin cities:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

// POST /api/admin/cities → create
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const { name, stateName, latitude, longitude, image, featuredImage, content, order, isActive } = body;
    if (!name) {
      return NextResponse.json({ success: false, message: "Name is required" }, { status: 400 });
    }

    await dbConnect();

    let baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 0;
    while (await City.findOne({ slug })) {
      count++;
      slug = `${baseSlug}-${count}`;
    }

    const city = await City.create({
      name: name.trim(),
      slug,
      stateName: stateName || null,
      latitude: latitude != null && latitude !== "" ? Number(latitude) : null,
      longitude: longitude != null && longitude !== "" ? Number(longitude) : null,
      image: image || null,
      featuredImage: featuredImage || null,
      content: content || null,
      order: order != null ? Number(order) : 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    expireTag("locations"); // catalog: places map + picker

    return NextResponse.json({ success: true, message: "City created", data: city });
  } catch (error: any) {
    console.error("POST admin cities:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
