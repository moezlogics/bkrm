import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { requireAuth, requireAdmin } from "@/lib/auth";

/**
 * CNIC + selfie identity verification.
 *
 * POST  → user submits cnicImage + selfieImage (URLs already uploaded via
 *         /api/upload). Stored as pending (isCnicVerified stays false).
 * GET   → current user's verification status.
 * PATCH → admin approves/rejects a user's CNIC verification.
 */

// Submit CNIC + selfie for review
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    const { cnicImage, selfieImage } = await req.json();

    if (!cnicImage || !selfieImage) {
      return NextResponse.json(
        { success: false, message: "Both CNIC image and selfie are required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const user = await User.findById(session.userId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    user.cnicImage = cnicImage;
    user.selfieImage = selfieImage;
    user.isCnicVerified = false; // pending admin review
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Verification documents submitted. Pending admin review.",
      data: { verificationLevel: user.verificationLevel, isCnicVerified: false },
    });
  } catch (error: any) {
    console.error("POST verify-cnic Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to submit verification" },
      { status: 500 }
    );
  }
}

// Current user's verification status
export async function GET() {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    await dbConnect();

    const user = await User.findById(session.userId)
      .select("isPhoneVerified isCnicVerified verificationLevel cnicImage selfieImage")
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        isPhoneVerified: user.isPhoneVerified,
        isCnicVerified: user.isCnicVerified,
        verificationLevel: user.verificationLevel,
        hasSubmitted: !!(user.cnicImage && user.selfieImage),
        // pending = submitted but not yet approved
        status: user.isCnicVerified
          ? "verified"
          : user.cnicImage && user.selfieImage
          ? "pending"
          : "none",
      },
    });
  } catch (error: any) {
    console.error("GET verify-cnic Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch status" },
      { status: 500 }
    );
  }
}

// Admin: approve / reject a user's CNIC verification
export async function PATCH(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { userId, decision } = await req.json();

    if (!userId || (decision !== "approve" && decision !== "reject")) {
      return NextResponse.json(
        { success: false, message: "userId and decision (approve|reject) are required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    if (decision === "approve") {
      user.isCnicVerified = true;
      // CNIC verified = at least level 2 (don't demote a verified shop)
      if (user.verificationLevel < 2) user.verificationLevel = 2;
    } else {
      user.isCnicVerified = false;
      if (user.verificationLevel >= 2 && !user.isShop) {
        user.verificationLevel = user.isPhoneVerified ? 1 : 0;
      }
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: `Verification ${decision}d`,
      data: {
        userId: user._id.toString(),
        isCnicVerified: user.isCnicVerified,
        verificationLevel: user.verificationLevel,
      },
    });
  } catch (error: any) {
    console.error("PATCH verify-cnic Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update verification" },
      { status: 500 }
    );
  }
}
