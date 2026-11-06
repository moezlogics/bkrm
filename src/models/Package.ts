/**
 * Package (Plan) Model
 *
 * A purchasable seller plan: how many listings they may keep active, and how
 * many of those they can Feature/Boost (and for how long). Free tier is implicit
 * (no plan) and driven by Setting `default_free_ad_quota`.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IPackage extends Document {
  name: string;
  price: number;
  discountInPercentage: number;
  finalPrice: number;
  durationDays: number;          // plan validity
  listingLimit: number;          // max active listings
  featuredLimit: number;         // how many can be featured
  featuredDurationDays: number;  // each feature lasts this long
  type: "free" | "paid";
  description?: string;
  features: string[];            // bullet points for the plan card
  sortOrder: number;
  isPopular: boolean;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PackageSchema = new Schema<IPackage>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    discountInPercentage: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true },
    durationDays: { type: Number, default: 30 },
    listingLimit: { type: Number, default: 20 },
    featuredLimit: { type: Number, default: 0 },
    featuredDurationDays: { type: Number, default: 30 },
    type: { type: String, enum: ["free", "paid"], default: "paid" },
    description: { type: String, default: null },
    features: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PackageSchema.index({ status: 1, sortOrder: 1 });

if (mongoose.models.Package) mongoose.deleteModel("Package");
export default mongoose.model<IPackage>("Package", PackageSchema);
