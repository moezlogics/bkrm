import { NextRequest, NextResponse } from "next/server";
import { isPlainEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import OtpCode from "@/models/OtpCode";
import { issueOtp, otpSentRecently, checkOtp } from "@/lib/otp";

/**
 * Password reset by email code.
 *  POST { email }                          → email a 6-digit code (10 min)
 *  PUT  { email, code, newPassword }       → verify the code, set the password
 *
 * The POST answer is the same whether or not the email has an account, so
 * the form can't be used to find out who is registered.
 */
const GENERIC = "If an account exists for this email, we've sent a 6-digit code to it.";

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const em = String(email || "").trim().toLowerCase();
  if (!isPlainEmail(em)) return NextResponse.json({ success: false, message: "Enter a valid email" }, { status: 400 });

  await dbConnect();
  if (await otpSentRecently(em, "password_reset")) return NextResponse.json({ success: false, message: "Please wait a minute before asking for another code" }, { status: 429 });

  const user = await User.findOne({ email: em }).select("_id isBlocked").lean();
  let devCode: string | undefined;
  if (user && !(user as any).isBlocked) {
    const r = await issueOtp(em, "password_reset");
    devCode = (r as any).devCode;
  }
  return NextResponse.json({ success: true, message: GENERIC, ...(devCode ? { devCode } : {}) });
}

export async function PUT(req: NextRequest) {
  const { email, code, newPassword } = await req.json().catch(() => ({}));
  const em = String(email || "").trim().toLowerCase();
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ success: false, message: "New password must be at least 8 characters" }, { status: 400 });
  }
  await dbConnect();
  const r = await checkOtp(em, "password_reset", code);
  if (!r.ok) return NextResponse.json({ success: false, reason: r.reason, message: r.message }, { status: r.status });

  const user = await User.findOne({ email: em });
  if (!user) return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
  user.password = await bcrypt.hash(newPassword, 10);
  user.emailVerified = true; // they just proved they own the inbox
  await user.save();
  await OtpCode.deleteMany({ email: em, purpose: "password_reset" });
  return NextResponse.json({ success: true, message: "Password updated — you can log in now" });
}
