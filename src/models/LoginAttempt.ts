/**
 * Failed sign-in counters (lib/login-guard). One row per key — "ip:<ip>",
 * "ipacct:<ip>|<email>", "acct:<email>" — shared by every app instance.
 * Rows delete themselves when their window and lock have both passed.
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface ILoginAttempt extends Document {
  key: string;
  fails: number;
  windowStart: Date;
  lockedUntil: Date | null;
  expiresAt: Date;
}

const LoginAttemptSchema = new Schema<ILoginAttempt>({
  key: { type: String, required: true, unique: true },
  fails: { type: Number, default: 0 },
  windowStart: { type: Date, default: () => new Date() },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});
LoginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.LoginAttempt || mongoose.model<ILoginAttempt>("LoginAttempt", LoginAttemptSchema);
