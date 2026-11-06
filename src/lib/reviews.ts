/**
 * Seller reviews — shared by the reviews API and the seller page.
 * Members' reviews are "Verified"; guests review under a name they give.
 */
import mongoose from "mongoose";
import Review from "@/models/Review";
import User from "@/models/User";
import Listing from "@/models/Listing";

export type PublicReview = {
  _id: string;
  rating: number;
  comment: string;
  reviewer: { name: string; image: string | null } | null;
  guest: boolean;
  verified: boolean;
  dealVerified: boolean;
  item: { title: string; slug: string } | null;
  createdAt: string;
};

/** Reviews that count: everything but what an admin hid (older rows have no status). */
export const VISIBLE = { status: { $ne: "hidden" as const } };

let indexes: Promise<void> | null = null;
/**
 * Once per process: swap the old unique {reviewerId, sellerId, itemId} index
 * (it rejected every guest review after the first — null reviewer, null item)
 * for plain lookup indexes. One-review-per-member is enforced by the upsert.
 * Production runs with auto-indexing off, so this is where they get built.
 */
export function ensureReviewIndexes(): Promise<void> {
  indexes ??= (async () => {
    const coll = Review.collection;
    const existing = await coll.indexes().catch(() => [] as any[]);
    for (const i of existing) {
      if (i.unique && i.key?.reviewerId === 1 && i.key?.itemId === 1 && i.name) await coll.dropIndex(i.name).catch(() => {});
    }
    await Promise.all([
      coll.createIndex({ sellerId: 1, createdAt: -1 }),
      coll.createIndex({ reviewerId: 1, sellerId: 1 }, { partialFilterExpression: { reviewerId: { $type: "objectId" } } }),
      coll.createIndex({ guestKey: 1, createdAt: -1 }, { partialFilterExpression: { guestKey: { $type: "string" } } }),
    ]).catch((e) => console.error("[reviews] index build failed:", e?.message));
  })().catch(() => { indexes = null; });
  return indexes;
}

export function toPublicReview(r: any): PublicReview {
  const member = r.reviewerId && typeof r.reviewerId === "object" && "name" in r.reviewerId ? r.reviewerId : null;
  return {
    _id: String(r._id),
    rating: r.rating,
    comment: r.comment || "",
    reviewer: member
      ? { name: member.name || "Member", image: member.profileImage || null }
      : r.guestName ? { name: r.guestName, image: null } : null,
    guest: !r.reviewerId,
    // Rows from before guest reviews were all members with an accepted deal.
    verified: !!r.reviewerId && r.verified !== false,
    dealVerified: !!r.dealVerified || (!!r.reviewerId && r.verified === undefined),
    item: r.itemId && typeof r.itemId === "object" && "slug" in r.itemId ? { title: r.itemId.name, slug: r.itemId.slug } : null,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

/** A seller's visible reviews: members' (verified) first, then newest. */
export async function sellerReviews(sellerId: string, limit = 50): Promise<PublicReview[]> {
  if (!mongoose.isValidObjectId(sellerId)) return [];
  const rows = await Review.find({ sellerId, ...VISIBLE })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate({ path: "reviewerId", model: User, select: "name profileImage" })
    .populate({ path: "itemId", model: Listing, select: "name slug" })
    .lean();
  const list = rows.map(toPublicReview);
  return [...list.filter((r) => r.verified), ...list.filter((r) => !r.verified)];
}

/**
 * Re-derive a seller's rating, ratingCount and sellerHealthScore.
 * Health score (0-100): 80% weight on average rating, 20% on sales volume.
 */
export async function recomputeSellerReputation(sellerId: string) {
  const stats = await Review.aggregate([
    { $match: { sellerId: new mongoose.Types.ObjectId(sellerId), ...VISIBLE } },
    { $group: { _id: "$sellerId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const avg = stats[0]?.avg || 0;
  const count = stats[0]?.count || 0;
  const seller = await User.findById(sellerId).select("salesCount");
  const salesCount = seller?.salesCount || 0;
  const sellerHealthScore = Math.round((avg / 5) * 80 + (Math.min(salesCount, 30) / 30) * 20);
  await User.findByIdAndUpdate(sellerId, { rating: Math.round(avg * 10) / 10, ratingCount: count, sellerHealthScore });
}
