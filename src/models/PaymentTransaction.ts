/**
 * PaymentTransaction Model
 *
 * Tracks payments made by users through various payment gateways.
 * Unique compound index on [paymentGateway, orderId] prevents
 * duplicate transaction processing.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IPaymentTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  amount: number;
  paymentGateway: string;
  orderId: string;
  paymentId?: string;
  paymentSignature?: string;
  paymentStatus: "failed" | "succeed" | "pending";
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    paymentGateway: { type: String, required: true },
    orderId: { type: String, required: true },
    paymentId: { type: String, default: null },
    paymentSignature: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ["failed", "succeed", "pending"],
      default: "pending",
    },
  },
  { timestamps: true }
);

PaymentTransactionSchema.index(
  { paymentGateway: 1, orderId: 1 },
  { unique: true }
);
PaymentTransactionSchema.index({ userId: 1 });
PaymentTransactionSchema.index({ paymentStatus: 1 });

export default mongoose.models.PaymentTransaction ||
  mongoose.model<IPaymentTransaction>(
    "PaymentTransaction",
    PaymentTransactionSchema
  );
