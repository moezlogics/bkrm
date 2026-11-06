import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Invoice from "@/models/Invoice";
import Package from "@/models/Package";
import { requireAuth } from "@/lib/auth";
import { getPaymentMethods } from "@/lib/plan";

async function genInvoiceNumber(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const n = `INV-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(10 + Math.random() * 89)}`;
    if (!(await Invoice.findOne({ invoiceNumber: n }))) return n;
  }
  return `INV-${Date.now()}`;
}

// GET /api/invoices — the seller's own invoices
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  await dbConnect();
  const invoices = await Invoice.find({ userId: session.userId }).sort({ createdAt: -1 }).limit(50)
    .select("invoiceNumber planName amount status rejectionReason createdAt submittedAt reviewedAt paymentMethod").lean();
  return NextResponse.json({ success: true, data: invoices.map((i: any) => ({ ...i, _id: i._id.toString() })) }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * POST /api/invoices { packageId } — start (or continue) paying for a plan.
 *
 * One tap opens the checkout, so this never piles up invoices: an unpaid
 * invoice for the same plan is reused (a rejected one is reopened), unpaid
 * ones for other plans are dropped, and while a payment is being checked a
 * second one can't be started — the seller would pay twice.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { packageId } = await req.json().catch(() => ({}));
  if (!packageId || !mongoose.isValidObjectId(String(packageId))) return NextResponse.json({ success: false, message: "Please choose a plan" }, { status: 400 });

  await dbConnect();
  const pkg = await Package.findById(packageId);
  if (!pkg || !pkg.status || pkg.type === "free" || !(pkg.finalPrice > 0)) return NextResponse.json({ success: false, message: "This plan isn't available any more — please choose another." }, { status: 404 });

  const uid = new mongoose.Types.ObjectId(session.userId);
  const inReview: any = await Invoice.findOne({ userId: uid, status: "submitted" }).select("invoiceNumber planName").lean();
  if (inReview) {
    return NextResponse.json({
      success: false, code: "in_review",
      message: `Your payment for ${inReview.planName} (${inReview.invoiceNumber}) is being checked. You'll get a notification as soon as it's done — usually the same day.`,
    }, { status: 409 });
  }

  const snapshot = {
    listingLimit: pkg.listingLimit,
    featuredLimit: pkg.featuredLimit,
    featuredDurationDays: pkg.featuredDurationDays,
    durationDays: pkg.durationDays,
  };
  let invoice = await Invoice.findOne({ userId: uid, packageId: pkg._id, status: { $in: ["awaiting_payment", "rejected"] } }).sort({ createdAt: -1 });
  if (invoice) {
    // Same plan again: keep the number they may already have used, with today's price.
    invoice.amount = pkg.finalPrice;
    invoice.planName = pkg.name;
    invoice.planSnapshot = snapshot as any;
    await invoice.save();
  } else {
    invoice = await Invoice.create({
      invoiceNumber: await genInvoiceNumber(),
      userId: uid,
      packageId: pkg._id,
      planName: pkg.name,
      amount: pkg.finalPrice,
      planSnapshot: snapshot,
      status: "awaiting_payment",
    });
  }
  // Unpaid invoices for other plans were just abandoned choices.
  await Invoice.deleteMany({ userId: uid, _id: { $ne: invoice._id }, status: "awaiting_payment" });

  return NextResponse.json({
    success: true,
    data: { invoice: JSON.parse(JSON.stringify(invoice)), paymentMethods: await getPaymentMethods() },
  });
}
