/**
 * FeaturedItem Model
 *
 * Links a listing to a purchased package for featured placement.
 * Tracks the featuring period via startDate/endDate.
 * Unique compound index on [itemId, packageId] prevents
 * duplicate featuring for the same package.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IFeaturedItem extends Document {
  startDate: Date;
  endDate: Date;
  itemId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  userPurchasedPackageId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeaturedItemSchema = new Schema<IFeaturedItem>(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    userPurchasedPackageId: {
      type: Schema.Types.ObjectId,
      ref: "UserPurchasedPackage",
      required: true,
    },
  },
  { timestamps: true }
);

FeaturedItemSchema.index({ itemId: 1, packageId: 1 }, { unique: true });
FeaturedItemSchema.index({ endDate: 1 });

export default mongoose.models.FeaturedItem ||
  mongoose.model<IFeaturedItem>("FeaturedItem", FeaturedItemSchema);
