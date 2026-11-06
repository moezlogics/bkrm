/**
 * Invoice Model — manual (no gateway) plan payments.
 *
 * Flow: seller picks a plan → invoice `awaiting_payment` (shows admin's payment
 * options) → seller pays externally + uploads screenshot → `submitted` → admin
 * `approved` (activates subscription) or `rejected`.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IInvoice extends Document {
  invoiceNumber: string;
  userId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  planName: string;
  amount: number;
  planSnapshot: {
    listingLimit: number;
    featuredLimit: number;
    featuredDurationDays: number;
    durationDays: number;
  };
  status: "awaiting_payment" | "submitted" | "approved" | "rejected";
  paymentMethod?: string;      // which option the seller used
  paymentScreenshot?: string;  // uploaded proof
  transactionNote?: string;    // optional txn id / sender name
  rejectionReason?: string;
  submittedAt?: Date;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    packageId: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    planName: { type: String, default: "" },
    amount: { type: Number, required: true },
    planSnapshot: {
      listingLimit: { type: Number, default: 0 },
      featuredLimit: { type: Number, default: 0 },
      featuredDurationDays: { type: Number, default: 30 },
      durationDays: { type: Number, default: 30 },
    },
    status: {
      type: String,
      enum: ["awaiting_payment", "submitted", "approved", "rejected"],
      default: "awaiting_payment",
    },
    paymentMethod: { type: String, default: null },
    paymentScreenshot: { type: String, default: null },
    transactionNote: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

InvoiceSchema.index({ userId: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1, createdAt: -1 });

if (mongoose.models.Invoice) mongoose.deleteModel("Invoice");
export default mongoose.model<IInvoice>("Invoice", InvoiceSchema);
