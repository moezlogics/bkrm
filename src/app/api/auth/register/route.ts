import { NextRequest, NextResponse } from "next/server";
import { isPlainEmail } from "@/lib/email";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { issueOtp } from "@/lib/otp";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";

// POST /api/auth/register { name, email, password } — create (unverified) + send OTP
export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) return NextResponse.json({ success: false, message: "Name, email and password are required" }, { status: 400 });
    if (String(password).length < 8) return NextResponse.json({ success: false, message: "Use at least 8 characters for your password" }, { status: 400 });
    const em = String(email).toLowerCase().trim();
    if (!isPlainEmail(em)) return NextResponse.json({ success: false, message: "Enter a valid email address" }, { status: 400 });

    await dbConnect();
    const existing = await User.findOne({ email: em });
    if (existing && existing.emailVerified) {
      return NextResponse.json({ success: false, code: "exists", message: "An account with this email already exists. Please log in." }, { status: 409 });
    }

    const hash = await bcrypt.hash(String(password), 10);
    if (existing) {
      existing.name = name.trim();
      existing.password = hash;
      existing.provider = "credentials";
      await existing.save();
    } else {
      const u = await User.create({ name: name.trim(), email: em, password: hash, provider: "credentials", emailVerified: false, onboardingCompleted: true });
      notifyDiscord({ title: "🆕 New account", description: `**${u.name}** — ${em}\nSigned up with email (code not entered yet)`, url: `/admin/users?q=${encodeURIComponent(em)}`, color: DISCORD_COLORS.account, category: "accounts" });
    }

    const otp: any = await issueOtp(em);
    return NextResponse.json({
      success: true,
      emailStatus: otp.emailStatus,
      message: otp.emailStatus === "sent" ? "We've emailed you a 6-digit code." : otp.emailStatus === "sending" ? "Sending your code…" : "We couldn't send the email just now — tap “Resend code”.",
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    });
  } catch (e: any) {
    console.error("register error:", e);
    return NextResponse.json({ success: false, message: e.message || "Register fail" }, { status: 500 });
  }
}
