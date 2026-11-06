/**
 * Offer Model
 *
 * Represents a price offer from a buyer to a seller on a specific listing.
 * Unique compound index on [buyerId, itemId] ensures one active offer
 * per buyer per listing.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IOffer extends Document {
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  amount: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

const OfferSchema = new Schema<IOffer>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

OfferSchema.index({ buyerId: 1, itemId: 1 }, { unique: true });
OfferSchema.index({ sellerId: 1 });
OfferSchema.index({ itemId: 1 });

export default mongoose.models.Offer ||
  mongoose.model<IOffer>("Offer", OfferSchema);
