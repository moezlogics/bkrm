/**
 * One browser/device that allowed notifications.
 *
 * A person can have several (phone + laptop); a device can exist without an
 * account (guests get campaigns only). Location and device fields are
 * refreshed every time the device checks in, so campaign targeting ("Lahore
 * sellers on Android") and the admin breakdowns stay current.
 */
import mongoose, { Schema, type Document } from "mongoose";

export type PushSubStatus = "active" | "expired" | "invalid" | "unsubscribed";

export interface IPushSubscriber extends Document {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: mongoose.Types.ObjectId | null;
  isSeller: boolean;
  /** The signed-in owner switched off "News & offers" — campaigns skip it. */
  promoOff: boolean;
  cityId: mongoose.Types.ObjectId | null;
  city: string | null;
  areaId: mongoose.Types.ObjectId | null;
  area: string | null;
  state: string | null;
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop";
  lang: string | null;
  source: string;
  status: PushSubStatus;
  sentCount: number;
  clickCount: number;
  failCount: number;
  lastSeenAt: Date;
  lastSentAt: Date | null;
  lastClickAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriberSchema = new Schema<IPushSubscriber>(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    isSeller: { type: Boolean, default: false },
    promoOff: { type: Boolean, default: false },
    cityId: { type: Schema.Types.ObjectId, default: null },
    city: { type: String, default: null },
    areaId: { type: Schema.Types.ObjectId, default: null },
    area: { type: String, default: null },
    state: { type: String, default: null },
    browser: { type: String, default: "Other" },
    os: { type: String, default: "Other" },
    device: { type: String, enum: ["mobile", "tablet", "desktop"], default: "desktop" },
    lang: { type: String, default: null },
    source: { type: String, default: "prompt" },
    status: { type: String, enum: ["active", "expired", "invalid", "unsubscribed"], default: "active" },
    sentCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: () => new Date() },
    lastSentAt: { type: Date, default: null },
    lastClickAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A person's devices (auto pushes), campaign batches (walk active subs by _id
// within a segment), and the admin breakdowns / growth chart.
PushSubscriberSchema.index({ userId: 1, status: 1 });
PushSubscriberSchema.index({ status: 1, _id: 1 });
PushSubscriberSchema.index({ status: 1, cityId: 1, _id: 1 });
PushSubscriberSchema.index({ status: 1, state: 1, _id: 1 });
PushSubscriberSchema.index({ createdAt: -1 });
PushSubscriberSchema.index({ endedAt: -1 }, { sparse: true });

if (mongoose.models.PushSubscriber) mongoose.deleteModel("PushSubscriber");
export default mongoose.model<IPushSubscriber>("PushSubscriber", PushSubscriberSchema);
