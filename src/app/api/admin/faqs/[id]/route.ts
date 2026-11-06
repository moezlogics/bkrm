import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Faq from "@/models/Faq";
import { requireAdmin } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { error } = await requireAdmin();
    if (error) return error;
    const body = await req.json();
    await dbConnect();
    const faq = await Faq.findById(id);
    if (!faq) return NextResponse.json({ success: false, message: "FAQ not found" }, { status: 404 });
    if (body.question !== undefined) faq.question = body.question.trim();
    if (body.answer !== undefined) faq.answer = body.answer.trim();
    if (body.category !== undefined) faq.category = body.category || "General";
    if (body.sequence !== undefined) faq.sequence = Number(body.sequence);
    if (body.status !== undefined) faq.status = Boolean(body.status);
    await faq.save();
    return NextResponse.json({ success: true, message: "FAQ updated", data: faq });
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
    await Faq.deleteOne({ _id: id });
    return NextResponse.json({ success: true, message: "FAQ deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
