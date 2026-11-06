import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Faq from "@/models/Faq";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    const faqs = await Faq.find({}).sort({ sequence: 1 }).lean();
    return NextResponse.json({ success: true, data: faqs });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const { question, answer, category, sequence, status } = await req.json();
    if (!question || !answer) {
      return NextResponse.json({ success: false, message: "Question and answer required" }, { status: 400 });
    }
    await dbConnect();
    const faq = await Faq.create({
      question: question.trim(), answer: answer.trim(),
      category: category || "General", sequence: sequence != null ? Number(sequence) : 0,
      status: status !== undefined ? Boolean(status) : true,
    });
    return NextResponse.json({ success: true, message: "FAQ created", data: faq });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}
