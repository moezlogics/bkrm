import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { issueOtp, otpSentRecently } from "@/lib/otp";
import { isPlainEmail } from "@/lib/email";

// POST /api/auth/resend-otp { email } — re-send the signup verification code
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 });
    const em = String(email).toLowerCase().trim();
    if (!isPlainEmail(em)) return NextResponse.json({ success: false, message: "Enter a valid email address" }, { status: 400 });

    await dbConnect();
    if (await otpSentRecently(em, "signup")) {
      return NextResponse.json({ success: false, message: "Please wait a minute before asking for another code" }, { status: 429 });
    }
    const user = await User.findOne({ email: em });
    if (!user) return NextResponse.json({ success: false, message: "Please sign up first" }, { status: 404 });
    if (user.emailVerified) return NextResponse.json({ success: false, message: "This email is already verified" }, { status: 400 });

    const otp: any = await issueOtp(em);
    if (otp.emailStatus === "failed" && !otp.devCode) {
      return NextResponse.json({ success: false, emailStatus: "failed", message: "We still couldn't send the email. Please check the address, or try again in a few minutes." }, { status: 502 });
    }
    return NextResponse.json({ success: true, emailStatus: otp.emailStatus, message: otp.emailStatus === "sent" ? "We've emailed your code again." : otp.emailStatus === "sending" ? "Sending your code…" : "Code ready (email sending is off).", ...(otp.devCode ? { devCode: otp.devCode } : {}) });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message || "Resend fail" }, { status: 500 });
  }
}
