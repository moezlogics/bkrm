import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import mongoose from "mongoose";
import { onReview } from "@/lib/push/events";
import dbConnect from "@/lib/mongodb";
import Review from "@/models/Review";
import Offer from "@/models/Offer";
import User from "@/models/User";
import { getServerSession } from "@/lib/auth";
import { clientIp } from "@/lib/location-cookies";
import { ensureReviewIndexes, recomputeSellerReputation, sellerReviews } from "@/lib/reviews";

/**
 * Seller reviews.
 *  GET    ?sellerId=…   visible reviews, members' (verified) first
 *  POST   { sellerId, rating, comment, name? }
 *           logged in → one review per seller (re-posting updates it), tagged
 *                       Verified, plus "Bought here" after an accepted deal
 *           guest     → name + rating + a written review; limited per IP
 *  DELETE ?id=…         admin: hide a review (drops it from the average)
 */

const bad = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });

export async function GET(req: NextRequest) {
  const sellerId = req.nextUrl.searchParams.get("sellerId") || "";
  if (!mongoose.isValidObjectId(sellerId)) return bad("sellerId is required");
  try {
    await dbConnect();
    return NextResponse.json({ success: true, data: await sellerReviews(sellerId) });
  } catch (error) {
    console.error("GET Reviews Error:", error);
    return bad("Couldn't load reviews", 500);
  }
}

// Links and phone numbers in a guest review are almost always spam.
const LINKY = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|pk|net|org|io|me|xyz)\b)/i;
const PHONEY = /(\d[\s-]?){10,}/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Honeypot: a field people never see. Bots fill it; pretend it worked.
    if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ success: true, message: "Thanks for your review" });

    const sellerId = String(body.sellerId || "");
    if (!mongoose.isValidObjectId(sellerId)) return bad("Seller not found", 404);
    const rating = Math.round(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) return bad("Please choose a star rating");
    const comment = typeof body.comment === "string" ? body.comment.trim().replace(/\s+\n/g, "\n").slice(0, 1000) : "";

    await dbConnect();
    await ensureReviewIndexes();
    if (!(await User.exists({ _id: sellerId }))) return bad("Seller not found", 404);

    const session = await getServerSession();
    let reviewerName: string;

    if (session) {
      if (session.userId === sellerId) return bad("You can't review yourself");
      const deal = await Offer.findOne({ buyerId: session.userId, sellerId, status: "accepted" }).sort({ updatedAt: -1 }).select("itemId").lean() as any;
      await Review.findOneAndUpdate(
        { reviewerId: session.userId, sellerId },
        {
          $set: {
            rating, comment: comment || null, verified: true, dealVerified: !!deal,
            ...(deal?.itemId ? { itemId: deal.itemId } : {}),
          },
          $setOnInsert: { status: "published" },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
      reviewerName = session.user?.name || "A member";
    } else {
      const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
      if (name.length < 2 || name.length > 40 || !/\p{L}/u.test(name)) return bad("Please enter your name (2–40 letters)");
      if (comment.length < 10) return bad("Please write a few words about your experience (at least 10 characters)");
      if (LINKY.test(comment) || LINKY.test(name) || PHONEY.test(comment)) return bad("Links and phone numbers aren't allowed in reviews");

      const ip = req.headers.get("cf-connecting-ip") || clientIp(req) || "unknown";
      const guestKey = crypto.createHash("sha256").update(`${ip}|${process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "reviews"}`).digest("hex").slice(0, 32);
      const day = new Date(Date.now() - 24 * 3600e3);
      const month = new Date(Date.now() - 30 * 24 * 3600e3);
      const [sameSeller, today] = await Promise.all([
        Review.exists({ guestKey, sellerId, createdAt: { $gt: month } }),
        Review.countDocuments({ guestKey, createdAt: { $gt: day } }),
      ]);
      if (sameSeller) return bad("You've already reviewed this seller. Log in to update your review.", 429);
      if (today >= 3) return bad("Too many reviews from your connection today — please try again tomorrow.", 429);

      await Review.create({ sellerId, rating, comment, guestName: name, guestKey, verified: false, status: "published" });
      reviewerName = name;
    }

    await recomputeSellerReputation(sellerId);
    onReview({ sellerId, reviewerId: session?.userId ?? null, reviewerName, rating, comment: comment || null });

    return NextResponse.json({ success: true, message: session ? "Review posted — thank you!" : "Thanks! Your review is live." });
  } catch (error) {
    console.error("POST Review Error:", error);
    return bad("Couldn't post your review — please try again", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession();
  if (session?.role !== "admin") return bad("Not allowed", 403);
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!mongoose.isValidObjectId(id)) return bad("Review not found", 404);
  await dbConnect();
  const r = await Review.findByIdAndUpdate(id, { $set: { status: "hidden" } }).select("sellerId").lean() as any;
  if (!r) return bad("Review not found", 404);
  await recomputeSellerReputation(String(r.sellerId));
  return NextResponse.json({ success: true, message: "Review removed" });
}
