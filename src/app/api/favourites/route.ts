import { NextRequest, NextResponse } from "next/server";
import { onFavourite } from "@/lib/push/events";
import dbConnect from "@/lib/mongodb";
import Favourite from "@/models/Favourite";
import Listing from "@/models/Listing";
import Category from "@/models/Category";
import User from "@/models/User";
import { requireAuth } from "@/lib/auth";
import { pushSellerStat } from "@/lib/pusher";
import { plainCustomFields } from "@/lib/utils";

function mapListingToAd(item: any): any {
  if (!item) return null;
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
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    await dbConnect();

    // 2. Fetch user's favourites
    const favouritesList = await Favourite.find({ userId: session.userId })
      .populate({
        path: "itemId",
        model: Listing,
        populate: [
          { path: "categoryId", model: Category },
          { path: "userId", model: User },
        ],
      })
      .lean();

    const mappedAds = favouritesList
      .map((fav: any) => mapListingToAd(fav.itemId))
      .filter((ad) => ad !== null);

    return NextResponse.json({
      success: true,
      data: mappedAds,
    });
  } catch (error: any) {
    console.error("GET Favourites Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch favourites list" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    const { adId } = await req.json();

    if (!adId) {
      return NextResponse.json(
        { success: false, message: "Ad ID is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    // 2. Check if item exists in Listing collection
    const itemExists = await Listing.findById(adId);
    if (!itemExists) {
      return NextResponse.json(
        { success: false, message: "Listing not found" },
        { status: 404 }
      );
    }

    // 3. Find existing favourite
    const existingFavourite = await Favourite.findOne({
      userId: session.userId,
      itemId: adId,
    });

    if (existingFavourite) {
      // Toggle off: remove
      await Favourite.deleteOne({ _id: existingFavourite._id });

      // Decrement counter on item
      await Listing.findByIdAndUpdate(adId, { $inc: { favouritesCount: -1 } });

      return NextResponse.json({
        success: true,
        message: "Removed from favourites",
        data: { isFavourite: false },
      });
    } else {
      // Toggle on: add
      await Favourite.create({
        userId: session.userId,
        itemId: adId,
      });

      // Increment counter on item
      await Listing.findByIdAndUpdate(adId, { $inc: { favouritesCount: 1 } });

      // Realtime: notify seller's analytics channel
      pushSellerStat(itemExists.userId.toString(), {
        type: "favourite",
        listingId: adId,
        delta: 1,
      });
      onFavourite({ listingId: adId, byUserId: session.userId });

      return NextResponse.json({
        success: true,
        message: "Added to favourites",
        data: { isFavourite: true },
      });
    }
  } catch (error: any) {
    console.error("POST Toggle Favourite Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to toggle favourite status" },
      { status: 500 }
    );
  }
}
