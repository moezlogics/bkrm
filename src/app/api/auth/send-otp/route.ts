import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { isPlainEmail } from "@/lib/email";
import { issueOtp, otpSentRecently } from "@/lib/otp";

/**
 * POST /api/auth/send-otp { email } — email a signup verification code.
 * Same checks as the other code routes: one plain address, at most one code
 * a minute, so this can't be used to flood someone's inbox.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({}));
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!isPlainEmail(cleanEmail)) {
      return NextResponse.json({ success: false, message: "Enter a valid email address" }, { status: 400 });
    }

    await dbConnect();
    if (await otpSentRecently(cleanEmail, "signup")) {
      return NextResponse.json({ success: false, message: "Please wait a minute before asking for another code" }, { status: 429 });
    }
    const otp: any = await issueOtp(cleanEmail, "signup");
    if (!otp.delivered && !otp.devCode) {
      return NextResponse.json({ success: false, message: "We couldn't send the email right now — please try again" }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      message: otp.delivered ? "Verification code sent to your email" : "Email isn't set up here — your code is included (development only)",
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    });
  } catch (error: any) {
    console.error("Send OTP Error:", error);
    return NextResponse.json({ success: false, message: "Failed to send the code" }, { status: 500 });
  }
}
