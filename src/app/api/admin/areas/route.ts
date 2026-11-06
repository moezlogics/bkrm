import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";
import Area from "@/models/Area";
import { requireAdmin } from "@/lib/auth";
import slugify from "slugify";
import { expireTag } from "@/lib/catalog";

// GET /api/admin/areas?cityId=... → areas for a city
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const { searchParams } = new URL(req.url);
    const cityId = searchParams.get("cityId");
    await dbConnect();
    const query: any = {};
    if (cityId) query.cityId = cityId;
    const areas = await Area.find(query).sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, data: areas });
  } catch (error: any) {
    console.error("GET admin areas:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

// POST /api/admin/areas → create (requires cityId)
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const { name, cityId, latitude, longitude, content, featuredImage, isActive } = body;
    if (!name || !cityId) {
      return NextResponse.json({ success: false, message: "Name and city are required" }, { status: 400 });
    }

    await dbConnect();
    const city = await City.findById(cityId).lean();
    if (!city) return NextResponse.json({ success: false, message: "City not found" }, { status: 404 });

    let baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 0;
    while (await Area.findOne({ citySlug: city.slug, slug })) {
      count++;
      slug = `${baseSlug}-${count}`;
    }

    const area = await Area.create({
      name: name.trim(),
      slug,
      cityId,
      citySlug: city.slug,
      latitude: latitude != null && latitude !== "" ? Number(latitude) : null,
      longitude: longitude != null && longitude !== "" ? Number(longitude) : null,
      content: content || null,
      featuredImage: featuredImage || null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    expireTag("locations"); // catalog: places map + picker

    return NextResponse.json({ success: true, message: "Area created", data: area });
  } catch (error: any) {
    console.error("POST admin areas:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
