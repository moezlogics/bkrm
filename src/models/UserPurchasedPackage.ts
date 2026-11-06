/**
 * UserPurchasedPackage = an active seller Subscription.
 *
 * Created when an admin approves a paid invoice. Snapshots the plan's limits so
 * later plan edits don't retroactively change an active subscription. Drives the
 * posting limit and the Feature/Boost allowance.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IUserPurchasedPackage extends Document {
  userId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId | null;
  planName: string;
  status: "active" | "expired";
  startDate: Date;
  endDate: Date;
  listingLimit: number;
  featuredLimit: number;
  featuredDurationDays: number;
  featuredUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserPurchasedPackageSchema = new Schema<IUserPurchasedPackage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    packageId: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    planName: { type: String, default: "" },
    status: { type: String, enum: ["active", "expired"], default: "active" },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    listingLimit: { type: Number, default: 20 },
    featuredLimit: { type: Number, default: 0 },
    featuredDurationDays: { type: Number, default: 30 },
    featuredUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

UserPurchasedPackageSchema.index({ userId: 1, status: 1, endDate: -1 });

if (mongoose.models.UserPurchasedPackage) mongoose.deleteModel("UserPurchasedPackage");
export default mongoose.model<IUserPurchasedPackage>("UserPurchasedPackage", UserPurchasedPackageSchema);
