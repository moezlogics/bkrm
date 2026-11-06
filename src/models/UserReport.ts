/**
 * UserReport Model
 *
 * A user-submitted report against a listing OR a seller profile.
 * `type` distinguishes them; itemId (listing) / reportedUserId (seller) are set
 * accordingly. `reason` is free-text/selected; reportReasonId is optional.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IUserReport extends Document {
  type: "listing" | "seller";
  userId: mongoose.Types.ObjectId; // reporter
  itemId?: mongoose.Types.ObjectId | null;
  reportedUserId?: mongoose.Types.ObjectId | null;
  reportReasonId?: mongoose.Types.ObjectId | null;
  reason?: string;
  otherMessage?: string;
  status: "open" | "reviewed" | "dismissed";
  createdAt: Date;
  updatedAt: Date;
}

const UserReportSchema = new Schema<IUserReport>(
  {
    type: { type: String, enum: ["listing", "seller"], default: "listing" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", default: null },
    reportedUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reportReasonId: { type: Schema.Types.ObjectId, ref: "ReportReason", default: null },
    reason: { type: String, default: null },
    otherMessage: { type: String, default: null },
    status: { type: String, enum: ["open", "reviewed", "dismissed"], default: "open" },
  },
  { timestamps: true }
);

UserReportSchema.index({ userId: 1 });
UserReportSchema.index({ itemId: 1 });
UserReportSchema.index({ reportedUserId: 1 });
UserReportSchema.index({ status: 1, createdAt: -1 });

// HMR-safe (see nextjs16-gotchas): re-register so new fields apply without restart.
if (mongoose.models.UserReport) mongoose.deleteModel("UserReport");
export default mongoose.model<IUserReport>("UserReport", UserReportSchema);
