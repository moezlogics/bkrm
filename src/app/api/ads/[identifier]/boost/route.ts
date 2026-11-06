import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import { getServerSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/plan";
import UserPurchasedPackage from "@/models/UserPurchasedPackage";

// POST /api/ads/[identifier]/boost — feature a listing using a plan's featured allowance.
export async function POST(req: NextRequest, { params }: { params: Promise<{ identifier: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ success: false, message: "Login required" }, { status: 401 });
  const { identifier } = await params;

  await dbConnect();
  const q = mongoose.Types.ObjectId.isValid(identifier) ? { _id: identifier } : { slug: identifier.toLowerCase() };
  const listing = await Listing.findOne(q);
  if (!listing) return NextResponse.json({ success: false, message: "Listing not found" }, { status: 404 });
  if (listing.userId.toString() !== session.userId) return NextResponse.json({ success: false, message: "Not your listing" }, { status: 403 });
  if (listing.status !== "approved") return NextResponse.json({ success: false, message: "Only a live listing can be boosted" }, { status: 400 });
  if (listing.featuredExpiresAt && new Date(listing.featuredExpiresAt) > new Date())
    return NextResponse.json({ success: false, message: "This listing is already featured" }, { status: 400 });

  const sub = await getActiveSubscription(session.userId);
  if (!sub) return NextResponse.json({ success: false, code: "no-plan", message: "Buy a plan first to boost listings." }, { status: 403 });
  if (sub.featuredUsed >= sub.featuredLimit)
    return NextResponse.json({ success: false, code: "no-slots", message: `You've used all ${sub.featuredLimit} featured slots in your plan — upgrade to boost more ads.` }, { status: 403 });

  const took = await UserPurchasedPackage.updateOne({ _id: sub._id, featuredUsed: { $lt: sub.featuredLimit } }, { $inc: { featuredUsed: 1 } });
  if (!took.modifiedCount) return NextResponse.json({ success: false, code: "no-slots", message: `You've used all ${sub.featuredLimit} featured slots in your plan — upgrade to boost more ads.` }, { status: 403 });
  sub.featuredUsed += 1;

  const days = sub.featuredDurationDays || 30;
  listing.isFeatured = true;
  listing.featuredExpiresAt = new Date(Date.now() + days * 864e5);
  listing.bumpedAt = new Date();
  await listing.save();

  return NextResponse.json({
    success: true,
    message: `Your ad is featured for ${days} days`,
    data: { featuredExpiresAt: listing.featuredExpiresAt, featuredRemaining: sub.featuredLimit - sub.featuredUsed },
  });
}
