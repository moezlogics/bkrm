import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Setting from "@/models/Setting";
import { requireAdmin } from "@/lib/auth";
import { getPaymentMethods } from "@/lib/plan";

// GET — current payment methods
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  await dbConnect();
  return NextResponse.json({ success: true, data: await getPaymentMethods() });
}

// PUT { methods: [...] } — replace payment methods
export async function PUT(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { methods } = await req.json();
  if (!Array.isArray(methods)) return NextResponse.json({ success: false, message: "methods array required" }, { status: 400 });
  const clean = methods
    .filter((m: any) => m && m.title && m.account)
    .map((m: any) => ({ type: String(m.type || m.title).trim(), title: String(m.title).trim(), account: String(m.account).trim(), name: m.name ? String(m.name).trim() : "", instructions: m.instructions ? String(m.instructions).trim() : "" }));
  await dbConnect();
  await Setting.findOneAndUpdate({ key: "payment_methods" }, { key: "payment_methods", value: JSON.stringify(clean) }, { upsert: true });
  return NextResponse.json({ success: true, message: "Payment methods saved", data: clean });
}
