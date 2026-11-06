/**
 * Daily push totals per notification type ("message", "price_drop",
 * "campaign"…) for the admin dashboard: sent / failed / delivered / clicked /
 * closed, plus new and lost subscribers. Written in batches (lib/push/stats).
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IPushStat extends Document {
  day: string; // YYYY-MM-DD, Pakistan time
  type: string;
  sent: number;
  failed: number;
  delivered: number;
  clicked: number;
  closed: number;
  subscribed: number;
  unsubscribed: number;
}

const PushStatSchema = new Schema<IPushStat>({
  day: { type: String, required: true },
  type: { type: String, required: true },
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  clicked: { type: Number, default: 0 },
  closed: { type: Number, default: 0 },
  subscribed: { type: Number, default: 0 },
  unsubscribed: { type: Number, default: 0 },
});

PushStatSchema.index({ day: 1, type: 1 }, { unique: true });

if (mongoose.models.PushStat) mongoose.deleteModel("PushStat");
export default mongoose.model<IPushStat>("PushStat", PushStatSchema);
