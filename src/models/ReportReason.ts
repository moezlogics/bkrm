/**
 * ReportReason Model
 *
 * Predefined reasons for reporting listings (e.g., "Spam", "Fraud").
 * Used as a lookup table by UserReport.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IReportReason extends Document {
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportReasonSchema = new Schema<IReportReason>(
  {
    reason: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.ReportReason ||
  mongoose.model<IReportReason>("ReportReason", ReportReasonSchema);
