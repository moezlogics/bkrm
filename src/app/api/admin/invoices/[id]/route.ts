import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Invoice from "@/models/Invoice";
import { requireAdmin } from "@/lib/auth";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import { activatePlan } from "@/lib/plan";
import { logAdmin } from "@/lib/admin-log";
import User from "@/models/User";
import { onPlanDecision } from "@/lib/push/events";
import { sendPlanResultEmail } from "@/lib/email";

// PUT /api/admin/invoices/[id] { action: "approve" | "reject", reason? }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const { action, reason } = await req.json();

  await dbConnect();
  const inv = await Invoice.findById(id);
  if (!inv) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });

  if (action === "approve") {
    if (inv.status === "approved") return NextResponse.json({ success: false, message: "Already approved" }, { status: 400 });
    // Ends any current subscription, then starts this plan.
    const sub = await activatePlan({ userId: inv.userId, packageId: inv.packageId, invoiceId: inv._id, planName: inv.planName, snap: inv.planSnapshot });
    const endDate = sub.endDate;
    inv.status = "approved";
    inv.reviewedAt = new Date();
    inv.rejectionReason = undefined;
    await inv.save();

    notifyDiscord({ title: "Payment approved — plan active", description: `Invoice **${inv.invoiceNumber}** — **${inv.planName}** active till ${endDate.toLocaleDateString()}`, color: DISCORD_COLORS.approved, category: "payments" });
    await logAdmin(session, { action: "invoice.approve", targetType: "invoice", targetId: inv._id, targetLabel: inv.invoiceNumber, details: `${inv.planName} — Rs ${Number(inv.amount || 0).toLocaleString()}, active till ${endDate.toLocaleDateString("en-PK")}` });
    // The seller hears straight away: bell, phone and email.
    const buyer: any = await User.findById(inv.userId).select("name email").lean();
    onPlanDecision({ userId: inv.userId, approved: true, planName: inv.planName, sub });
    sendPlanResultEmail(buyer?.email, { name: buyer?.name, approved: true, planName: inv.planName, sub });
    return NextResponse.json({ success: true, message: `${inv.planName} plan is now active.` });
  }

  if (action === "reject") {
    if (inv.status === "approved") return NextResponse.json({ success: false, message: "This payment is already approved — end the plan from Users instead." }, { status: 400 });
    inv.status = "rejected";
    inv.reviewedAt = new Date();
    inv.rejectionReason = reason || "Payment could not be verified.";
    await inv.save();
    notifyDiscord({ title: "Payment rejected", description: `Invoice **${inv.invoiceNumber}**`, color: DISCORD_COLORS.report, category: "payments", fields: [{ name: "Reason", value: reason || "—" }] });
    await logAdmin(session, { action: "invoice.reject", targetType: "invoice", targetId: inv._id, targetLabel: inv.invoiceNumber, details: inv.rejectionReason });
    const buyer: any = await User.findById(inv.userId).select("name email").lean();
    onPlanDecision({ userId: inv.userId, approved: false, planName: inv.planName, reason: inv.rejectionReason });
    sendPlanResultEmail(buyer?.email, { name: buyer?.name, approved: false, planName: inv.planName, reason: inv.rejectionReason, invoiceNumber: inv.invoiceNumber });
    return NextResponse.json({ success: true, message: "Invoice rejected." });
  }

  return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
}
