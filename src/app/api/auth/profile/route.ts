import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { requireAuth } from "@/lib/auth";
import { normalizePkMobile, PHONE_HINT } from "@/lib/phone";
import { slugsFromProfile } from "@/lib/profile-location";
import { setLocationCookies } from "@/lib/location-cookies";

export async function GET() {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    await dbConnect();

    const user = await User.findById(session.userId).lean();
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        city: user.city,
        // area and bio were missing here, so the profile form always showed
        // them empty after a reload (and saving then wiped them).
        area: (user as any).area || "",
        bio: (user as any).bio || "",
        isSeller: !!(user as any).isSeller,
        state: user.state,
        country: user.country,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        createdAt: user.createdAt,
        // trust & reputation
        isPhoneVerified: user.isPhoneVerified,
        isCnicVerified: user.isCnicVerified,
        verificationLevel: user.verificationLevel,
        rating: user.rating,
        ratingCount: user.ratingCount,
        salesCount: user.salesCount,
        sellerHealthScore: user.sellerHealthScore,
        isShop: user.isShop,
        shopName: user.shopName,
        shopSlug: user.shopSlug,
      },
    });
  } catch (error: any) {
    console.error("GET Profile Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/auth/profile — edit your own profile.
 * Body (all optional): name, phoneNumber, profileImage, city, area, bio,
 * mode ("buyer" | "seller") to switch account type.
 */
export async function PUT(req: NextRequest) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    await dbConnect();
    const user = await User.findById(session.userId);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

    const bad = (message: string) => NextResponse.json({ success: false, message }, { status: 400 });
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);

    const name = str(body.name);
    if (name !== undefined) {
      if (name.length < 2 || name.length > 60) return bad("Name should be 2–60 characters");
      user.name = name;
    }
    const phone = str(body.phoneNumber);
    if (phone !== undefined) {
      const normal = normalizePkMobile(phone);
      if (normal === null) return bad(PHONE_HINT);
      if (normal !== (user.phoneNumber || "")) {
        // One account per number — the number is what makes an account "verified".
        if (normal && (await User.exists({ _id: { $ne: user._id }, phoneNumber: normal }))) {
          return bad("This number is already used on another account");
        }
        user.phoneNumber = normal || undefined;
        user.isPhoneVerified = false; // a new number hasn't been checked
      }
    }
    const img = str(body.profileImage);
    if (img !== undefined) {
      if (img && !/^(\/media\/|https?:\/\/)/.test(img)) return bad("Invalid image");
      user.profileImage = img || undefined;
    }
    const city = str(body.city);
    const area = str(body.area);
    const placeChanged = (city !== undefined && city !== (user.city || "")) || (area !== undefined && area !== (user.area || ""));
    if (city !== undefined) user.city = city.slice(0, 60) || undefined;
    if (area !== undefined) user.area = area.slice(0, 60) || undefined;
    const bio = str(body.bio);
    if (bio !== undefined) user.bio = bio.slice(0, 300) || undefined;
    if (body.mode === "seller") user.isSeller = true;
    if (body.mode === "buyer") user.isSeller = false;

    await user.save();

    const res = NextResponse.json({
      success: true,
      message: "Profile updated",
      data: {
        id: user._id.toString(), name: user.name, email: user.email, phoneNumber: user.phoneNumber,
        profileImage: user.profileImage, city: user.city, area: user.area, bio: user.bio, isSeller: user.isSeller,
      },
    });
    // A new city/area in the profile becomes the site's location too (header,
    // search, feeds) — the header and the profile are one setting.
    if (placeChanged && user.city) {
      const slugs = await slugsFromProfile(user.city, user.area);
      if (slugs) setLocationCookies(res, { citySlug: slugs.citySlug, areaSlug: slugs.areaSlug, source: "manual" });
    }
    return res;
  } catch (error: any) {
    console.error("PUT Profile Error:", error);
    return NextResponse.json({ success: false, message: "Failed to update profile" }, { status: 500 });
  }
}
