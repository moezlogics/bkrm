import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Listing, { IListing } from "@/models/Listing";
import Category from "@/models/Category";
import User from "@/models/User";
import { getServerSession } from "@/lib/auth";
import { plainCustomFields } from "@/lib/utils";
import { keywordMatch, tokensOf } from "@/lib/search";
import { getCatalog } from "@/lib/catalog";

const escapeRx = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Map Listing document to Frontend Ad type structure
function mapListingToAd(item: any): any {
  const seller = item.userId
    ? {
        _id: item.userId._id?.toString() || item.userId.toString(),
        name: item.userId.name || "Unknown Seller",
        image: item.userId.profileImage || null,
        createdAt: item.userId.createdAt || new Date(),
        verificationLevel: item.userId.verificationLevel || 0,
        rating: item.userId.rating || 0,
        ratingCount: item.userId.ratingCount || 0,
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
    priceMode: item.priceMode || "fixed",
    priceMax: item.priceMax ?? null,
    currency: item.currency || "PKR",
    isUrgent: !!item.isUrgent,
    videoLink: item.videoLink || null,
    images: images,
    category,
    seller,
    location: {
      city: item.city || "",
      state: item.state || "",
    },
    condition: item.condition || null,
    customFields: plainCustomFields(item.customFieldValues),
    isFeatured: !!item.isFeatured,
    status: item.status === "approved" ? "active" : item.status === "sold out" ? "sold" : item.status === "rejected" || item.status === "expired" ? "expired" : "pending",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const categoryId = searchParams.get("categoryId");
    const city = searchParams.get("city");
    const state = searchParams.get("state");
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const condition = searchParams.get("condition");
    const statusParam = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "newest";
    // Bounded paging: no single request can pull (or skip through) the whole table.
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 12));
    const page = Math.min(Math.floor(5000 / limit) + 1, Math.max(1, Number(searchParams.get("page")) || 1));
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    await dbConnect();

    const query: any = {};

    // 1. Keyword search on the indexed `kw` tokens (see lib/keywords).
    // Same matching as /search (partial words expand to whole keywords).
    if (search) Object.assign(query, await keywordMatch(tokensOf(search).slice(0, 6)));

    // 2. Category, including everything under it: every ad's allCategoryIds
    //    holds its whole [section, brand, model] chain (indexed).
    if (categoryId) {
      query.allCategoryIds = String(categoryId);
    }

    // 3. Location: a known city by its indexed reference; otherwise an exact
    //    (escaped) name match — raw input never becomes a regex pattern.
    if (city) {
      const v = city.trim().toLowerCase();
      const catalog = await getCatalog();
      const known = catalog.city(v) || catalog.cities.find((c) => c.name.toLowerCase() === v);
      if (known) query["locationRefs.cityId"] = known._id;
      else query.city = { $regex: new RegExp(`^${escapeRx(city.trim())}$`, "i") };
    }
    if (state) {
      query.state = { $regex: new RegExp(`^${escapeRx(state.trim())}$`, "i") };
    }

    // 4. Within 50 km. $geoWithin (not $near): $near can't be combined with
    // the count below or with the sort options, and threw on every such call.
    if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      query.location = {
        $geoWithin: { $centerSphere: [[Number(lng), Number(lat)], 50 / 6378.1] },
      };
    }

    // 5. Price filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // 6. Condition filter
    if (condition) {
      query.condition = condition;
    }

    // 7. Status filter
    // If not specified, default to approved (which is 'active'). Anything other
    // than live ads (review queue, rejected…) is for admins only.
    if (statusParam && statusParam !== "active" && statusParam !== "approved") {
      const session = await getServerSession();
      if ((session as any)?.role !== "admin") {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }
    if (statusParam) {
      query.status = statusParam === "active" ? "approved" : statusParam === "pending" ? "review" : statusParam === "sold" ? "sold out" : statusParam;
    } else {
      query.status = "approved";
    }

    // 8. Spec filters: cf_<slug>=value (exact), cf_<slug>_min / cf_<slug>_max (ranges:
    // year, mileage, engine…). Slugs are plain identifiers — nothing else reaches the query.
    for (const [key, value] of searchParams.entries()) {
      const m = /^cf_([a-z0-9_]{1,40}?)(?:_(min|max))?$/.exec(key);
      if (!m || !value) continue;
      const path = `customFieldValues.${m[1]}`;
      if (m[2]) {
        const n = Number(value);
        if (!Number.isFinite(n)) continue;
        query[path] = { ...(typeof query[path] === "object" ? query[path] : {}), [m[2] === "min" ? "$gte" : "$lte"]: n };
      } else {
        query[path] = String(value).slice(0, 100);
      }
    }

    // 9. Sorting setup
    let sortOptions: any = { createdAt: -1 };
    if (sortBy === "oldest") {
      sortOptions = { createdAt: 1 };
    } else if (sortBy === "price_low") {
      sortOptions = { price: 1 };
    } else if (sortBy === "price_high") {
      sortOptions = { price: -1 };
    }

    // Execute paginated query
    const skip = (page - 1) * limit;
    const [listings, total] = await Promise.all([
      Listing.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate({ path: "categoryId", model: Category, select: "name slug image parentCategoryId" })
        .populate({ path: "userId", model: User, select: "name profileImage createdAt verificationLevel rating ratingCount" })
        .maxTimeMS(8000)
        .lean(),
      // Counting a huge match is itself a scan — cap it (pages stop at 5,000 ads anyway).
      Listing.countDocuments(query).limit(5001).maxTimeMS(8000),
    ]);
    const mappedAds = listings.map((item) => mapListingToAd(item));

    return NextResponse.json({
      success: true,
      data: {
        data: mappedAds,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("GET Ads Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to query listings" },
      { status: 500 }
    );
  }
}

// Ads are created only through /api/ads/publish (lib/ad-form): it enforces the
// plan quota, seller verification, spam and contact-info checks and own-media
// photos. A second, unchecked create endpoint here used to bypass all of that.
