import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Invoice from "@/models/Invoice";
import { requireAuth } from "@/lib/auth";
import { getPaymentMethods } from "@/lib/plan";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import mongoose from "mongoose";
import Media from "@/models/Media";
import User from "@/models/User";
import { onPaymentSubmitted } from "@/lib/push/events";

/** The screenshot must be this person's own private payment upload. */
async function ownPaymentUpload(url: string, userId: string) {
  const id = url.match(/\/media\/p\/([a-f0-9]{24})(?:$|[?#])/)?.[1];
  const q: Record<string, unknown> = { uploadedBy: new mongoose.Types.ObjectId(userId), folder: "payments" };
  return id ? Media.exists({ _id: id, ...q }) : Media.exists({ url, ...q });
}

async function owned(id: string, userId: string) {
  const inv = await Invoice.findById(id);
  if (!inv || inv.userId.toString() !== userId) return null;
  return inv;
}

// GET /api/invoices/[id] — invoice detail + payment options (owner)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  await dbConnect();
  const inv = await owned(id, session.userId);
  if (!inv) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: { invoice: JSON.parse(JSON.stringify(inv)), paymentMethods: await getPaymentMethods() } });
}

// POST /api/invoices/[id] — submit payment proof (owner) → status "submitted"
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const paymentScreenshot = typeof body.paymentScreenshot === "string" ? body.paymentScreenshot.trim() : "";
  const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim().slice(0, 60) : "";
  const transactionNote = typeof body.transactionNote === "string" ? body.transactionNote.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!paymentScreenshot) return NextResponse.json({ success: false, field: "screenshot", message: "Please upload the payment screenshot" }, { status: 400 });

  await dbConnect();
  const inv = await owned(id, session.userId);
  if (!inv) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  if (inv.status === "approved") return NextResponse.json({ success: false, message: "This invoice is already approved" }, { status: 400 });
  if (inv.status === "submitted") return NextResponse.json({ success: false, message: "This payment is already with our team — you'll hear back soon." }, { status: 400 });
  if (!(await ownPaymentUpload(paymentScreenshot, session.userId))) {
    return NextResponse.json({ success: false, field: "screenshot", message: "The screenshot didn't upload properly — please add it again" }, { status: 400 });
  }
  const methods = await getPaymentMethods();
  if (methods.length && paymentMethod && !methods.some((m) => m.title === paymentMethod)) {
    return NextResponse.json({ success: false, field: "method", message: "Choose the account you sent the money to" }, { status: 400 });
  }

  inv.paymentScreenshot = paymentScreenshot;
  inv.paymentMethod = paymentMethod || null;
  inv.transactionNote = transactionNote || null;
  inv.status = "submitted";
  inv.submittedAt = new Date();
  inv.rejectionReason = undefined;
  await inv.save();

  notifyDiscord({
    title: "Payment submitted — needs approval",
    category: "payments",
    description: `Invoice **${inv.invoiceNumber}** — plan **${inv.planName}** (Rs ${inv.amount.toLocaleString()})`,
    url: "/admin/invoices",
    color: DISCORD_COLORS.invoice,
    fields: [
      { name: "Method", value: paymentMethod || "—", inline: true },
      { name: "Txn note", value: transactionNote || "—", inline: true },
    ],
  });

  const payer: any = await User.findById(session.userId).select("name").lean();
  onPaymentSubmitted({ name: payer?.name || "A seller", amount: inv.amount, planName: inv.planName });

  return NextResponse.json({ success: true, message: "Payment sent for checking. Your plan starts as soon as our team verifies it — usually the same day." });
}
