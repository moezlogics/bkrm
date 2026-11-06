import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    const { name, phoneNumber, city, state } = await req.json();

    if (!name || !phoneNumber || !city) {
      return NextResponse.json(
        { success: false, message: "Name, phone number, and city are required" },
        { status: 400 }
      );
    }

    await dbConnect();

    // 2. Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      session.userId,
      {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        city: city.trim(),
        state: state ? state.trim() : "",
        onboardingCompleted: true,
      },
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Onboarding completed successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        city: updatedUser.city,
        state: updatedUser.state,
        onboardingCompleted: updatedUser.onboardingCompleted,
      },
    });
  } catch (error: any) {
    console.error("Onboarding Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update onboarding profile" },
      { status: 500 }
    );
  }
}
