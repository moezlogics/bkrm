import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import Favourite from "@/models/Favourite";
import Offer from "@/models/Offer";
import ChatMessage from "@/models/ChatMessage";
import UserReport from "@/models/UserReport";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "@/lib/auth";
import { listingLimitReached } from "@/lib/plan";
import { deleteFromCdn, uploadToCdn } from "@/lib/cdn-client";
import { countView } from "@/lib/counters";
import { adjustScopeCounts } from "@/lib/scope-counts";
import mongoose from "mongoose";
import slugify from "slugify";
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
    previousPrice: item.previousPrice ?? null,
    priceDroppedAt: item.priceDroppedAt ?? null,
    isUrgent: !!item.isUrgent,
    videoLink: item.videoLink || null,
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

function isObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    await dbConnect();

    let query: any = {};
    if (isObjectId(identifier)) {
      query._id = identifier;
    } else {
      query.slug = identifier.toLowerCase();
    }

    const item = await Listing.findOne(query)
      .populate({ path: "categoryId", model: Category })
      .populate({ path: "userId", model: User });

    if (!item) {
      return NextResponse.json(
        { success: false, message: "Listing not found" },
        { status: 404 }
      );
    }

    // Held for review or rejected: only its seller and the admins see it.
    if (item.status === "review" || item.status === "rejected") {
      const session = await getServerSession();
      const ownerId = String((item.userId as any)?._id || item.userId || "");
      if (!session || (session.role !== "admin" && session.userId !== ownerId)) {
        return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
      }
    }

    // Count the view (buffered bulk write; it also pushes the seller's live
    // stat) — never a full document save on a read.
    countView(item._id.toString());

    return NextResponse.json({
      success: true,
      data: mapListingToAd(item),
    });
  } catch (error: any) {
    console.error("GET Single Ad Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch listing detail" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    // 1. Authenticate user
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    await dbConnect();

    // 2. Fetch Listing
    let itemQuery: any = {};
    if (isObjectId(identifier)) {
      itemQuery._id = identifier;
    } else {
      itemQuery.slug = identifier.toLowerCase();
    }

    const item = await Listing.findOne(itemQuery);
    if (!item) {
      return NextResponse.json(
        { success: false, message: "Listing not found" },
        { status: 404 }
      );
    }

    // 3. Authorization check
    const isOwner = item.userId.toString() === session.userId;
    const isAdmin = session.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, message: "You are not authorized to update this listing" },
        { status: 403 }
      );
    }

    // 4. Parse fields
    let name = "";
    let description = "";
    let price: number | undefined;
    let categoryId = "";
    let city = "";
    let state = "";
    let address = "";
    let contactNumber = "";
    let condition = "";
    let statusParam = "";
    let images: string[] = [];
    let customFieldValues: Record<string, string> = {};
    let lat: number | undefined;
    let lng: number | undefined;
    let videoLink: string | undefined;
    let isUrgent: boolean | undefined;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      name = body.title || body.name;
      description = body.description;
      if (body.price !== undefined) price = Number(body.price);
      if (body.videoLink !== undefined) videoLink = body.videoLink;
      if (body.isUrgent !== undefined) isUrgent = Boolean(body.isUrgent);
      categoryId = body.categoryId || body.category;
      city = body.city;
      state = body.state;
      address = body.address;
      contactNumber = body.contactNumber || body.phone;
      condition = body.condition;
      statusParam = body.status;
      images = body.images;
      customFieldValues = body.customFields || body.customFieldValues;
      if (body.location?.coordinates) {
        lng = Number(body.location.coordinates[0]);
        lat = Number(body.location.coordinates[1]);
      } else if (body.lat !== undefined && body.lng !== undefined) {
        lat = Number(body.lat);
        lng = Number(body.lng);
      }
    } else {
      // Parse FormData
      const formData = await req.formData();
      name = (formData.get("title") || formData.get("name")) as string;
      description = formData.get("description") as string;
      if (formData.get("price")) price = Number(formData.get("price"));
      if (formData.has("videoLink")) videoLink = formData.get("videoLink") as string;
      if (formData.has("isUrgent")) isUrgent = formData.get("isUrgent") === "true";
      categoryId = (formData.get("categoryId") || formData.get("category")) as string;
      city = formData.get("city") as string;
      state = formData.get("state") as string;
      address = formData.get("address") as string;
      contactNumber = (formData.get("contactNumber") || formData.get("phone")) as string;
      condition = formData.get("condition") as string;
      statusParam = formData.get("status") as string;

      const cfString = formData.get("customFields") as string;
      if (cfString) {
        try {
          customFieldValues = JSON.parse(cfString);
        } catch {
          customFieldValues = {};
        }
      }

      for (const [key, value] of formData.entries()) {
        if (key.startsWith("cf_")) {
          customFieldValues[key.substring(3)] = value as string;
        }
      }

      if (formData.get("lat") && formData.get("lng")) {
        lat = Number(formData.get("lat"));
        lng = Number(formData.get("lng"));
      }

      const imageEntries = formData.getAll("images");
      for (const entry of imageEntries) {
        if (entry instanceof File) {
          try {
            const buffer = Buffer.from(await entry.arrayBuffer());
            const uploadRes = await uploadToCdn(buffer, entry.name, "image", entry.type);
            if (uploadRes.success) {
              images.push(uploadRes.data.url);
            }
          } catch (err) {
            console.error("CDN upload error in edit ad:", err);
          }
        } else if (typeof entry === "string" && entry.startsWith("http")) {
          images.push(entry);
        }
      }
    }

    // Owners edit content through /api/ads/publish (lib/ad-form), which runs the
    // spam, contact-info, photo and category checks. Here they may only change
    // the status (mark sold / relist); admins may still correct anything.
    if (!isAdmin) {
      const edits = [name, description, categoryId, city, state, address, contactNumber, condition].some((v) => v != null && v !== "")
        || price !== undefined || videoLink !== undefined || isUrgent !== undefined || lat !== undefined
        || (images?.length ?? 0) > 0 || Object.keys(customFieldValues || {}).length > 0;
      if (edits) {
        return NextResponse.json({ success: false, message: "Edit your ad from its edit page." }, { status: 403 });
      }
    }

    // 5. Update properties
    if (name && name.trim() !== item.name) {
      item.name = name.trim();
      let baseSlug = slugify(name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 0;
      while (await Listing.findOne({ slug, _id: { $ne: item._id } })) {
        count++;
        slug = `${baseSlug}-${count}`;
      }
      item.slug = slug;
    }

    if (description !== undefined) item.description = description.trim();
    if (price !== undefined && price !== null) {
      if (item.price != null && price < item.price) {
        item.previousPrice = item.price;
        item.priceDroppedAt = new Date();
      }
      item.price = price;
    }
    if (videoLink !== undefined) item.videoLink = videoLink || undefined;
    if (isUrgent !== undefined) item.isUrgent = Boolean(isUrgent);
    if (categoryId) {
      const categoryExists = await Category.findById(categoryId);
      if (categoryExists) item.categoryId = new mongoose.Types.ObjectId(categoryId);
    }
    if (city !== undefined) item.city = city.trim();
    if (state !== undefined) item.state = state.trim();
    if (address !== undefined) item.address = address.trim();
    if (contactNumber !== undefined) item.contactNumber = contactNumber.trim();
    if (condition) item.condition = condition as any;

    if (images && images.length > 0) {
      item.mainImage = images[0];
      item.galleryImages = images;
    }

    if (lat !== undefined && lng !== undefined) {
      item.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }

    if (customFieldValues && Object.keys(customFieldValues).length > 0) {
      item.customFieldValues = new Map(Object.entries(customFieldValues));
    }

    // Status: admins may set any status. Owners may only mark their live ad as
    // sold and relist a sold one — never publish an ad that moderation is
    // holding or has rejected (not even via sold → relist). Plain edits keep
    // the current status (instant-publish model — no re-moderation).
    if (statusParam) {
      const aliases: Record<string, string> = { active: "approved", pending: "review", sold: "sold out" };
      const mapped = aliases[statusParam] || statusParam;
      if (!["review", "approved", "rejected", "sold out", "expired"].includes(mapped)) {
        return NextResponse.json({ success: false, message: "Unknown status" }, { status: 400 });
      }
      if (!isAdmin && mapped !== item.status) {
        const allowed = (mapped === "sold out" && item.status === "approved") || (mapped === "approved" && item.status === "sold out");
        if (!allowed) {
          const message = item.status === "review"
            ? "Your ad is waiting for review — it goes live as soon as our team approves it."
            : item.status === "rejected"
              ? "This ad wasn't approved. Edit it to fix the problem and it will be checked again."
              : "You can only mark a live ad as sold, or relist a sold one.";
          return NextResponse.json({ success: false, message }, { status: 403 });
        }
      }
      // Relisting a sold ad takes a live slot again — same limit as posting.
      if (!isAdmin && mapped === "approved" && item.status === "sold out") {
        const limit = await listingLimitReached(String(item.userId));
        if (limit) return NextResponse.json({ success: false, code: "limit", message: limit }, { status: 403 });
      }
      item.status = mapped as typeof item.status;
      if (mapped === "sold out") item.soldAt = new Date();
    }

    await item.save();

    const populatedListing = await Listing.findById(item._id)
      .populate({ path: "categoryId", model: Category })
      .populate({ path: "userId", model: User });

    return NextResponse.json({
      success: true,
      message: "Listing updated successfully",
      data: mapListingToAd(populatedListing),
    });
  } catch (error: any) {
    console.error("PUT Ad Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update listing" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  try {
    const { identifier } = await params;
    // 1. Authenticate user
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    await dbConnect();

    // 2. Fetch item to authorize and clean up media
    let itemQuery: any = {};
    if (isObjectId(identifier)) {
      itemQuery._id = identifier;
    } else {
      itemQuery.slug = identifier.toLowerCase();
    }

    const item = await Listing.findOne(itemQuery);
    if (!item) {
      return NextResponse.json(
        { success: false, message: "Listing not found" },
        { status: 404 }
      );
    }

    // 3. Authorization check
    const isOwner = item.userId.toString() === session.userId;
    const isAdmin = session.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, message: "You are not authorized to delete this listing" },
        { status: 403 }
      );
    }

    // 4. Delete images from CDN
    const images = item.galleryImages && item.galleryImages.length > 0 
      ? item.galleryImages 
      : (item.mainImage ? [item.mainImage] : []);

    if (images && images.length > 0) {
      for (const imageUrl of images) {
        try {
          const filename = imageUrl.split("/").pop();
          if (filename) {
            await deleteFromCdn(filename);
          }
        } catch (err) {
          console.error(`Failed to delete CDN file ${imageUrl}:`, err);
        }
      }
    }

    // 5. Delete the listing and everything that pointed at it.
    //    Without this, deleting an ad left dangling favourites/offers/reports
    //    behind: Saved Ads rendered blank rows and admin moderation lists
    //    referenced listings that no longer existed.
    await Listing.deleteOne({ _id: item._id });
    if (item.status === "approved") adjustScopeCounts(item, -1);
    await Promise.all([
      Favourite.deleteMany({ itemId: item._id }),
      Offer.deleteMany({ itemId: item._id }),
      ChatMessage.deleteMany({ itemId: item._id }),
      UserReport.deleteMany({ type: "listing", itemId: item._id }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Listing and its associated media deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE Ad Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete listing" },
      { status: 500 }
    );
  }
}
