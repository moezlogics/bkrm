import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import OtpCode from "@/models/OtpCode";
import User from "@/models/User";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, code, purpose, name, password } = await req.json();

    if (!email || !code) {
      return NextResponse.json(
        { success: false, message: "Email and OTP code are required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const activePurpose = purpose || "signup";

    await dbConnect();

    // 1. Fetch OTP record
    const otpRecord = await OtpCode.findOne({
      email: cleanEmail,
      purpose: activePurpose,
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

    // 3. Check if too many attempts
    if (otpRecord.attempts >= 5) {
      await OtpCode.deleteOne({ _id: otpRecord._id });
      return NextResponse.json(
        { success: false, message: "Too many incorrect attempts. Please request a new code." },
        { status: 400 }
      );
    }

    // 4. Verify code
    if (otpRecord.code !== code.trim()) {
      // Increment attempts
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

    // 5. Successful Verification
    if (activePurpose === "signup") {
      if (!name || !password) {
        // Just verify the code, but don't delete yet or do registration
        // (This allows verifying before asking for name/password in some UI flows, but let's make it create user here)
        return NextResponse.json({
          success: true,
          message: "Code verified. Please provide name and password to complete registration.",
          verified: true,
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        return NextResponse.json(
          { success: false, message: "An account with this email already exists" },
          { status: 400 }
        );
      }

      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        name: name.trim(),
        email: cleanEmail,
        emailVerified: true,
        password: hashedPassword,
        provider: "credentials",
        role: "user",
        onboardingCompleted: false,
      });

      // Cleanup OTP
      await OtpCode.deleteOne({ _id: otpRecord._id });

      return NextResponse.json({
        success: true,
        message: "Account created successfully! You can now log in.",
        userId: user._id,
      });
    } else if (activePurpose === "password_reset") {
      // Mark as verified but don't delete yet.
      // The client will use this code to update the password in the reset route.
      otpRecord.verified = true;
      await otpRecord.save();

      return NextResponse.json({
        success: true,
        message: "Verification successful. You can now reset your password.",
        verified: true,
      });
    }

    // Default verify
    await OtpCode.deleteOne({ _id: otpRecord._id });
    return NextResponse.json({
      success: true,
      message: "Email verified successfully.",
    });
  } catch (error: any) {
    console.error("OTP Verify Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to verify OTP" },
      { status: 500 }
    );
  }
}
