import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import FeatureSection from "@/models/FeatureSection";
import { requireAdmin } from "@/lib/auth";
import { clearHomeContent } from "@/lib/home-content";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;
    const b = await req.json();
    await dbConnect();
    const s = await FeatureSection.findById(id);
    if (!s) return NextResponse.json({ success: false, message: "Section not found" }, { status: 404 });
    if (b.title !== undefined) s.title = b.title.trim();
    if (b.sequence !== undefined) s.sequence = Number(b.sequence);
    if (b.filter !== undefined) s.filter = b.filter || null;
    if (b.value !== undefined) s.value = b.value || null;
    if (b.style !== undefined) s.style = b.style || "grid";
    if (b.minPrice !== undefined) s.minPrice = b.minPrice !== "" ? Number(b.minPrice) : null;
    if (b.maxPrice !== undefined) s.maxPrice = b.maxPrice !== "" ? Number(b.maxPrice) : null;
    await s.save();
    clearHomeContent();
    return NextResponse.json({ success: true, message: "Section updated", data: s });
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
    await FeatureSection.deleteOne({ _id: id });
    clearHomeContent();
    return NextResponse.json({ success: true, message: "Section deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
