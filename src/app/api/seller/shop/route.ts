import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { requireAuth } from "@/lib/auth";
import slugify from "slugify";

/**
 * Reseller / shop registration.
 *
 * GET  → current user's shop profile + status.
 * POST → register/update a shop. Requires CNIC verification first; on success
 *        the seller is upgraded to "Verified Shop" (verificationLevel 3).
 */
export async function GET() {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const user = await User.findById(session.userId)
      .select("isShop shopName shopSlug shopAddress shopLogo shopBanner shopDescription isCnicVerified verificationLevel")
      .lean();

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        isShop: user.isShop,
        shopName: user.shopName,
        shopSlug: user.shopSlug,
        shopAddress: user.shopAddress,
        shopLogo: user.shopLogo,
        shopBanner: user.shopBanner,
        shopDescription: user.shopDescription,
        canRegister: user.isCnicVerified,
        verificationLevel: user.verificationLevel,
      },
    });
  } catch (error: any) {
    console.error("GET Shop Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load shop" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    const { shopName, shopAddress, shopLogo, shopBanner, shopDescription } = await req.json();
    const img = (v: unknown) => (typeof v === "string" && /^(\/media\/(?!private\/)|https?:\/\/)/.test(v.trim()) ? v.trim() : null);
    if (!shopName || !shopName.trim()) {
      return NextResponse.json(
        { success: false, message: "Shop name is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const user = await User.findById(session.userId);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    // Gate: shops must be CNIC-verified to earn the Verified Shop badge.
    if (!user.isCnicVerified) {
      return NextResponse.json(
        {
          success: false,
          message: "Complete CNIC verification first, then you can register a shop.",
        },
        { status: 403 }
      );
    }

    // Generate a unique shop slug
    const baseSlug = slugify(shopName, { lower: true, strict: true });
    let shopSlug = baseSlug;
    let count = 0;
    while (await User.findOne({ shopSlug, _id: { $ne: user._id } })) {
      count++;
      shopSlug = `${baseSlug}-${count}`;
    }

    user.isShop = true;
    user.shopName = shopName.trim();
    user.shopAddress = (shopAddress || "").trim();
    user.shopLogo = img(shopLogo) || undefined;
    user.shopBanner = img(shopBanner) || undefined;
    user.shopDescription = typeof shopDescription === "string" ? shopDescription.trim().slice(0, 1000) : user.shopDescription;
    user.shopSlug = shopSlug;
    user.verificationLevel = 3;
    await user.save();

    return NextResponse.json({
      success: true,
      message: "Shop registered. You've earned the Verified Shop badge.",
      data: { shopSlug, verificationLevel: 3 },
    });
  } catch (error: any) {
    console.error("POST Shop Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to register shop" },
      { status: 500 }
    );
  }
}
