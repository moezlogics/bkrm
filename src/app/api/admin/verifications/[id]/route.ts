import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { requireAdmin } from "@/lib/auth";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import { onVerification } from "@/lib/push/events";
import { sendVerificationResultEmail } from "@/lib/email";
import { logAdmin } from "@/lib/admin-log";

// PUT /api/admin/verifications/[id]  { action: "approve" | "reject", reason? }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  let { action, reason } = await req.json().catch(() => ({} as any));

  await dbConnect();
  const u = await User.findById(id);
  if (!u) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

  if (action === "approve") {
    u.verificationStatus = "verified";
    u.verificationLevel = Math.max(u.verificationLevel || 0, 2) as any;
    u.isCnicVerified = true;
    if (u.verificationDoc) { (u.verificationDoc as any).reviewedAt = new Date(); (u.verificationDoc as any).rejectionReason = null; }
    await u.save();
    notifyDiscord({ title: "Verification approved", description: `**${u.name}** is now a verified seller.`, color: DISCORD_COLORS.approved, category: "verifications" });
    onVerification({ userId: u._id, approved: true });
    sendVerificationResultEmail(u.email, { name: u.name, approved: true });
    await logAdmin(session, { action: "verification.approve", targetType: "user", targetId: u._id, targetLabel: `${u.name} (${u.email})` });
    return NextResponse.json({ success: true, message: `${u.name} verified.` });
  }

  if (action === "reject") {
    reason = String(reason || "").trim().slice(0, 300);
    u.verificationStatus = "rejected";
    if (u.verificationDoc) { (u.verificationDoc as any).reviewedAt = new Date(); (u.verificationDoc as any).rejectionReason = reason || "The documents were not clear."; }
    await u.save();
    onVerification({ userId: u._id, approved: false, reason: reason || "The documents were not clear." });
    sendVerificationResultEmail(u.email, { name: u.name, approved: false, reason: reason || "The documents were not clear." });
    notifyDiscord({ title: "Verification rejected", description: `**${u.name}** verification request was rejected.`, color: DISCORD_COLORS.report, category: "verifications", fields: [{ name: "Reason", value: reason || "—" }] });
    await logAdmin(session, { action: "verification.reject", targetType: "user", targetId: u._id, targetLabel: `${u.name} (${u.email})`, details: reason || "The documents were not clear." });
    return NextResponse.json({ success: true, message: `${u.name} rejected.` });
  }

  return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
}
