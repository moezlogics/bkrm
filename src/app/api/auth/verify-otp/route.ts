import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import OtpCode from "@/models/OtpCode";
import User from "@/models/User";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json(
        { success: false, message: "Email and OTP code are required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    await dbConnect();

    // 1. Fetch OTP record
    const otpRecord = await OtpCode.findOne({
      email: cleanEmail,
      purpose: "signup",
    });

    if (!otpRecord) {
      return NextResponse.json(
        { success: false, message: "No verification request found for this email" },
        { status: 400 }
      );
    }

    // 2. Check if expired
    if (new Date() > otpRecord.expiresAt) {
      await OtpCode.deleteOne({ _id: otpRecord._id });
      return NextResponse.json(
        { success: false, message: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // 3. Check attempts
    if (otpRecord.attempts >= 5) {
      await OtpCode.deleteOne({ _id: otpRecord._id });
      return NextResponse.json(
        { success: false, message: "Too many incorrect attempts. Please request a new code." },
        { status: 400 }
      );
    }

    // 4. Verify code
    if (otpRecord.code !== code.trim()) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      const remaining = 5 - otpRecord.attempts;
      if (remaining <= 0) {
        await OtpCode.deleteOne({ _id: otpRecord._id });
        return NextResponse.json(
          { success: false, message: "Too many incorrect attempts. Please request a new code." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, message: `Invalid code. ${remaining} attempts remaining.` },
        { status: 400 }
      );
    }

    // 5. Check if user exists
    const user = await User.findOne({ email: cleanEmail });

    if (user) {
      if (user.isBlocked) {
        return NextResponse.json(
          { success: false, message: "Your account has been blocked" },
          { status: 403 }
        );
      }

      // Generate login token
      const token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
          role: user.role,
          onboardingCompleted: user.onboardingCompleted,
        },
        // Never a default: a guessable secret would let anyone mint tokens.
        (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET)!,
        { expiresIn: "30d", algorithm: "HS256" }
      );

      // Cleanup OTP
      await OtpCode.deleteOne({ _id: otpRecord._id });

      return NextResponse.json({
        success: true,
        message: "Login successful",
        data: {
          token,
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            onboardingCompleted: user.onboardingCompleted,
            role: user.role,
          },
        },
      });
    }

    // OTP matches, but user does not exist yet.
    // We mark the OTP as verified so the register endpoint knows this email is verified.
    otpRecord.verified = true;
    await otpRecord.save();

    return NextResponse.json({
      success: true,
      message: "Email verified. Please complete your registration.",
      data: {
        verified: true,
        userExists: false,
      },
    });
  } catch (error: any) {
    console.error("Verify OTP Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to verify OTP" },
      { status: 500 }
    );
  }
}
