import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import FeatureSection from "@/models/FeatureSection";
import { requireAdmin } from "@/lib/auth";
import { clearHomeContent } from "@/lib/home-content";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    const sections = await FeatureSection.find({}).sort({ sequence: 1 }).lean();
    return NextResponse.json({ success: true, data: sections });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const b = await req.json();
    if (!b.title) return NextResponse.json({ success: false, message: "Title required" }, { status: 400 });
    await dbConnect();
    const section = await FeatureSection.create({
      title: b.title.trim(),
      sequence: b.sequence != null ? Number(b.sequence) : 0,
      filter: b.filter || null,
      value: b.value || null,
      style: b.style || "grid",
      minPrice: b.minPrice != null && b.minPrice !== "" ? Number(b.minPrice) : null,
      maxPrice: b.maxPrice != null && b.maxPrice !== "" ? Number(b.maxPrice) : null,
    });
    clearHomeContent();
    return NextResponse.json({ success: true, message: "Section created", data: section });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
