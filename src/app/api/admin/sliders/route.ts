import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Slider from "@/models/Slider";
import { requireAdmin } from "@/lib/auth";
import { clearHomeContent } from "@/lib/home-content";

/**
 * GET /api/admin/sliders
 * Returns all sliders sorted by sequence (asc).
 */
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    await dbConnect();

    const sliders = await Slider.find().sort({ sequence: 1, createdAt: -1 }).lean();

    return NextResponse.json({ success: true, data: sliders });
  } catch (error: any) {
    console.error("GET Sliders Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch sliders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/sliders
 * Create a new slider from the request body.
 */
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const { image, sequence, thirdPartyLink, itemId } = body;

    if (!image || !String(image).trim()) {
      return NextResponse.json(
        { success: false, message: "Image URL is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const slider = await Slider.create({
      image: String(image).trim(),
      sequence: sequence !== undefined ? Number(sequence) : 0,
      thirdPartyLink: thirdPartyLink ? String(thirdPartyLink).trim() : null,
      itemId: itemId ? itemId : null,
    });
    clearHomeContent();

    return NextResponse.json({
      success: true,
      message: "Slider created successfully",
      data: slider,
    });
  } catch (error: any) {
    console.error("POST Slider Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create slider" },
      { status: 500 }
    );
  }
}
