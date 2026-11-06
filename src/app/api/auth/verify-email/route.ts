import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { checkOtp } from "@/lib/otp";
import { isPlainEmail } from "@/lib/email";

// POST /api/auth/verify-email { email, code } — verify the signup code.
// Idempotent: repeating it with the right code (a retry, a double tap) is fine.
export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json().catch(() => ({}));
    const em = String(email || "").toLowerCase().trim();
    if (!isPlainEmail(em)) return NextResponse.json({ success: false, message: "Enter a valid email address" }, { status: 400 });

    await dbConnect();
    const r = await checkOtp(em, "signup", code);
    if (!r.ok) {
      // The code record is gone (it expires 10 minutes after sending) but the
      // email was already confirmed — nothing left to do but log in.
      if (r.reason === "expired" && (await User.exists({ email: em, emailVerified: true }))) {
        return NextResponse.json({ success: true, already: true, message: "Your email is already verified." });
      }
      return NextResponse.json({ success: false, reason: r.reason, message: r.message }, { status: r.status });
    }

    await User.updateOne({ email: em }, { $set: { emailVerified: true } });
    return NextResponse.json({ success: true, message: "Email verified." });
  } catch (e: any) {
    console.error("verify-email error:", e);
    return NextResponse.json({ success: false, message: "Something went wrong on our side — please try again." }, { status: 500 });
  }
}
