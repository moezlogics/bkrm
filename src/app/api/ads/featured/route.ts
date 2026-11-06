import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import Category from "@/models/Category";
import User from "@/models/User";
import { plainCustomFields } from "@/lib/utils";

function mapListingToAd(item: any): any {
  const seller = item.userId
    ? {
        _id: item.userId._id?.toString() || item.userId.toString(),
        name: item.userId.name || "Unknown Seller",
        image: item.userId.profileImage || null,
        createdAt: item.userId.createdAt || new Date(),
      }
    : { _id: "", name: "Unknown Seller", createdAt: new Date() };

  const category = item.categoryId
    ? {
        _id: item.categoryId._id?.toString() || item.categoryId.toString(),
        name: item.categoryId.name || "",
        slug: item.categoryId.slug || "",
        image: item.categoryId.image || null,
        parent: item.categoryId.parentCategoryId?.toString() || null,
      }
    : { _id: "", name: "", slug: "" };

  const images = item.galleryImages && item.galleryImages.length > 0 
    ? item.galleryImages 
    : (item.mainImage ? [item.mainImage] : []);

  return {
    _id: item._id.toString(),
    slug: item.slug,
    title: item.name,
    description: item.description,
    price: item.price,
    images: images,
    category,
    location: {
      city: item.city || "",
      state: item.state || "",
    },
    condition: item.condition || "used",
    customFields: plainCustomFields(item.customFieldValues),
    seller,
    isFeatured: !!item.isFeatured,
    status: item.status === "approved" ? "active" : item.status === "sold out" ? "sold" : item.status === "rejected" || item.status === "expired" ? "expired" : "pending",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function GET() {
  try {
    await dbConnect();

    // Query active (approved) featured items, sorted by newest
    const items = await Listing.find({
      isFeatured: true,
      status: "approved",
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({ path: "categoryId", model: Category, select: "name slug image parentCategoryId" })
      .populate({ path: "userId", model: User, select: "name profileImage createdAt verificationLevel rating ratingCount" })
      .lean();

    const mapped = items.map((item) => mapListingToAd(item));

    return NextResponse.json({
      success: true,
      data: mapped,
    });
  } catch (error: any) {
    console.error("GET Featured Ads Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch featured ads" },
      { status: 500 }
    );
  }
}
