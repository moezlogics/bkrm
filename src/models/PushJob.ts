/**
 * An automatic push waiting for its time: held back by quiet hours, or a
 * reminder due later (e.g. "your boost ends tomorrow"). The push scheduler
 * sends due jobs; `key` stops the same reminder being queued twice.
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IPushJob extends Document {
  userId: mongoose.Types.ObjectId;
  type: string;
  vars: Record<string, unknown>;
  url: string | null;
  image: string | null;
  icon: string | null;
  tag: string | null;
  key: string | null;
  sendAt: Date;
  lockedUntil: Date | null;
  createdAt: Date;
}

const PushJobSchema = new Schema<IPushJob>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, required: true },
    vars: { type: Schema.Types.Mixed, default: {} },
    url: { type: String, default: null },
    image: { type: String, default: null },
    icon: { type: String, default: null },
    tag: { type: String, default: null },
    key: { type: String, default: null },
    sendAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PushJobSchema.index({ sendAt: 1 });
PushJobSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { key: { $type: "string" } } });

if (mongoose.models.PushJob) mongoose.deleteModel("PushJob");
export default mongoose.model<IPushJob>("PushJob", PushJobSchema);
