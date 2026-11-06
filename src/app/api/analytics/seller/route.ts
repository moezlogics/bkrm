import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import Offer from "@/models/Offer";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/analytics/seller
 * Aggregated analytics for the logged-in seller: totals, funnel,
 * status breakdown, and a per-listing performance table.
 */
export async function GET() {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    await dbConnect();

    const sellerObjectId = new mongoose.Types.ObjectId(session.userId);

    const [listingAgg, statusAgg, offerAgg, topListings] = await Promise.all([
      // Totals across all of this seller's listings
      Listing.aggregate([
        { $match: { userId: sellerObjectId } },
        {
          $group: {
            _id: null,
            totalListings: { $sum: 1 },
            totalViews: { $sum: "$clicks" },
            totalImpressions: { $sum: "$impressions" },
            totalFavourites: { $sum: "$favouritesCount" },
            totalCalls: { $sum: "$phoneClicks" },
            totalWhatsapp: { $sum: "$whatsappClicks" },
            totalChats: { $sum: "$chatClicks" },
            activeListings: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          },
        },
      ]),
      // Status breakdown
      Listing.aggregate([
        { $match: { userId: sellerObjectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // Offers received
      Offer.aggregate([
        { $match: { sellerId: sellerObjectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // Top listings by views
      Listing.find({ userId: sellerObjectId })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("name slug clicks impressions favouritesCount phoneClicks whatsappClicks chatClicks expiresAt price status mainImage galleryImages createdAt condition city customFieldValues")
        .lean(),
    ]);

    const totals = listingAgg[0] || { totalListings: 0, totalViews: 0, totalImpressions: 0, totalFavourites: 0, activeListings: 0 };

    const statusBreakdown: Record<string, number> = {};
    for (const s of statusAgg) statusBreakdown[s._id] = s.count;

    const offerBreakdown: Record<string, number> = { pending: 0, accepted: 0, rejected: 0 };
    let totalOffers = 0;
    for (const o of offerAgg) {
      offerBreakdown[o._id] = o.count;
      totalOffers += o.count;
    }

    // Funnel: views → favourites → offers → accepted (deals)
    const funnel = {
      views: totals.totalViews || 0,
      favourites: totals.totalFavourites || 0,
      offers: totalOffers,
      deals: offerBreakdown.accepted || 0,
    };

    const listings = topListings.map((l: any) => ({
      _id: l._id.toString(),
      title: l.name,
      slug: l.slug,
      price: l.price,
      status: l.status,
      views: l.clicks || 0,
      impressions: l.impressions || 0,
      favourites: l.favouritesCount || 0,
      leads: (l.phoneClicks || 0) + (l.whatsappClicks || 0) + (l.chatClicks || 0),
      expiresAt: l.expiresAt || null,
      image: l.mainImage || l.galleryImages?.[0] || null,
      createdAt: l.createdAt,
      condition: l.condition || null,
      city: l.city || "",
    }));

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          listings: totals.totalListings || 0,
          active: totals.activeListings || 0,
          views: totals.totalViews || 0,
          impressions: totals.totalImpressions || 0,
          favourites: totals.totalFavourites || 0,
          offers: totalOffers,
          leads: { calls: totals.totalCalls || 0, whatsapp: totals.totalWhatsapp || 0, chats: totals.totalChats || 0 },
        },
        statusBreakdown,
        offerBreakdown,
        funnel,
        listings,
      },
    });
  } catch (error: any) {
    console.error("GET Seller Analytics Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load analytics" },
      { status: 500 }
    );
  }
}
