/**
 * Review Model
 *
 * A rating (+ optional text) left for a seller — by a logged-in member or by a
 * guest who gives a name:
 *   verified      written by a logged-in member (shown with a "Verified" tag)
 *   dealVerified  that member had an accepted offer with the seller
 *   guestName     who a guest said they are (not checked)
 *   guestKey      hashed IP of a guest review — rate limiting only, never shown
 * One review per member per seller (re-submitting updates it). Admins hide
 * abusive reviews (status "hidden"), which drops them from the average.
 * Aggregated rating/ratingCount are denormalized onto the User document.
 *
 * Indexes live in lib/reviews (ensureReviewIndexes): the old unique
 * {reviewerId, sellerId, itemId} index treated every guest review of a seller
 * as a duplicate (null reviewer, null item) and has to be dropped first.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IReview extends Document {
  reviewerId?: mongoose.Types.ObjectId | null;
  sellerId: mongoose.Types.ObjectId;
  itemId?: mongoose.Types.ObjectId | null;
  rating: number; // 1-5
  comment?: string;
  guestName?: string | null;
  guestKey?: string | null;
  verified: boolean;
  dealVerified: boolean;
  status: "published" | "hidden";
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: null, trim: true },
    guestName: { type: String, default: null, trim: true },
    guestKey: { type: String, default: null, select: false },
    verified: { type: Boolean, default: false },
    dealVerified: { type: Boolean, default: false },
    status: { type: String, enum: ["published", "hidden"], default: "published" },
  },
  { timestamps: true, autoIndex: false }
);

if (mongoose.models.Review) mongoose.deleteModel("Review");
export default mongoose.model<IReview>("Review", ReviewSchema);
