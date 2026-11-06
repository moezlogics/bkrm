import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { otpSendStatus } from "@/lib/otp";
import { isPlainEmail } from "@/lib/email";

/**
 * POST /api/auth/otp-status { email } → { status: "sending" | "sent" | "failed" | "none" }
 * Lets the code screen say whether the sign-up email actually went out, so a
 * failed send shows "tap Resend" instead of an endless wait.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  const em = String(email || "").toLowerCase().trim();
  if (!isPlainEmail(em)) return NextResponse.json({ success: false, message: "Enter a valid email address" }, { status: 400 });
  await dbConnect();
  const status = await otpSendStatus(em, "signup");
  return NextResponse.json({ success: true, status }, { headers: { "Cache-Control": "no-store" } });
}
