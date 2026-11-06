import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Slider from "@/models/Slider";
import { requireAdmin } from "@/lib/auth";
import { clearHomeContent } from "@/lib/home-content";

/**
 * PUT /api/admin/sliders/[id]
 * Update an existing slider by id.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const { image, sequence, thirdPartyLink, itemId } = body;

    await dbConnect();

    const slider = await Slider.findById(id);
    if (!slider) {
      return NextResponse.json(
        { success: false, message: "Slider not found" },
        { status: 404 }
      );
    }

    if (image !== undefined) {
      if (!String(image).trim()) {
        return NextResponse.json(
          { success: false, message: "Image URL cannot be empty" },
          { status: 400 }
        );
      }
      slider.image = String(image).trim();
    }
    if (sequence !== undefined) slider.sequence = Number(sequence);
    if (thirdPartyLink !== undefined)
      slider.thirdPartyLink = thirdPartyLink ? String(thirdPartyLink).trim() : null;
    if (itemId !== undefined) slider.itemId = itemId ? itemId : null;

    await slider.save();
    clearHomeContent();

    return NextResponse.json({
      success: true,
      message: "Slider updated successfully",
      data: slider,
    });
  } catch (error: any) {
    console.error("PUT Slider Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update slider" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/sliders/[id]
 * Delete a slider by id.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { error } = await requireAdmin();
    if (error) return error;

    await dbConnect();

    const slider = await Slider.findById(id);
    if (!slider) {
      return NextResponse.json(
        { success: false, message: "Slider not found" },
        { status: 404 }
      );
    }

    await Slider.deleteOne({ _id: id });
    clearHomeContent();

    return NextResponse.json({
      success: true,
      message: "Slider deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE Slider Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete slider" },
      { status: 500 }
    );
  }
}
