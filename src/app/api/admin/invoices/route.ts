import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Invoice from "@/models/Invoice";
import User from "@/models/User";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/invoices?status=submitted
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "submitted";

  await dbConnect();
  const q: any = {};
  if (status !== "all") q.status = status;
  const invoices = await Invoice.find(q)
    .sort({ submittedAt: -1, createdAt: -1 })
    .limit(200)
    .populate({ path: "userId", model: User, select: "name email phoneNumber" })
    .lean();

  return NextResponse.json({
    success: true,
    data: invoices.map((i: any) => ({
      _id: i._id.toString(),
      invoiceNumber: i.invoiceNumber,
      planName: i.planName,
      amount: i.amount,
      status: i.status,
      paymentMethod: i.paymentMethod,
      paymentScreenshot: i.paymentScreenshot,
      transactionNote: i.transactionNote,
      rejectionReason: i.rejectionReason,
      snapshot: i.planSnapshot,
      seller: i.userId ? { _id: i.userId._id.toString(), name: i.userId.name, email: i.userId.email, phone: i.userId.phoneNumber } : null,
      submittedAt: i.submittedAt,
      createdAt: i.createdAt,
    })),
  });
}
