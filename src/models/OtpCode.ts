/**
 * OtpCode Model
 *
 * Stores OTP verification codes for email signup / password reset.
 * Matches the Medusa store's OTP module logic:
 *   - 6-digit code, 10-min expiry, max 5 attempts
 *   - Old codes for same email+purpose are deleted on new generation
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IOtpCode extends Document {
  email: string;
  code: string;
  purpose: "signup" | "password_reset" | "email_verify";
  attempts: number;
  expiresAt: Date;
  verified: boolean;
  /** When it was last emailed — a resend re-sends the same code (lib/otp). */
  lastSentAt?: Date | null;
  /** Did the last email actually go out? ("sending" while the mail server is slow) */
  sendStatus?: "sending" | "sent" | "failed" | null;
  sendError?: string | null;
  createdAt: Date;
}

const OtpCodeSchema = new Schema<IOtpCode>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true },
    purpose: {
      type: String,
      enum: ["signup", "password_reset", "email_verify"],
      required: true,
    },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    lastSentAt: { type: Date, default: null },
    sendStatus: { type: String, enum: ["sending", "sent", "failed", null], default: null },
    sendError: { type: String, default: null },
  },
  { timestamps: true }
);

OtpCodeSchema.index({ email: 1, purpose: 1 });
OtpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-cleanup

export default mongoose.models.OtpCode ||
  mongoose.model<IOtpCode>("OtpCode", OtpCodeSchema);
