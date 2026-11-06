import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import { requireAuth } from "@/lib/auth";
import { expirySettings, renewBlocker } from "@/lib/listing-expiry";
import { listingLimitReached } from "@/lib/plan";

/**
 * POST /api/ads/[identifier]/renew — the seller puts an expired ad back up
 * (within the reactivation window), or extends a live one in its last days.
 * Bringing back an expired ad takes a live slot again, like posting.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ identifier: string }> }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { identifier } = await params;
  await dbConnect();
  const item = await Listing.findOne(mongoose.isValidObjectId(identifier) ? { _id: identifier } : { slug: identifier.toLowerCase() });
  if (!item) return NextResponse.json({ success: false, message: "Ad not found" }, { status: 404 });
  if (String(item.userId) !== session.userId) return NextResponse.json({ success: false, message: "This isn't your ad." }, { status: 403 });

  const s = await expirySettings();
  const blocked = renewBlocker(item, s);
  if (blocked) return NextResponse.json({ success: false, message: blocked }, { status: 400 });

  if (item.status === "expired") {
    const limit = await listingLimitReached(session.userId);
    if (limit) return NextResponse.json({ success: false, code: "limit", message: limit }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + s.days * 864e5);
  item.status = "approved";
  item.expiresAt = expiresAt;
  await item.save();
  return NextResponse.json({ success: true, message: `Renewed — live until ${expiresAt.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}.`, data: { status: "approved", expiresAt } });
}
