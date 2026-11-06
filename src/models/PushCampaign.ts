/**
 * A manual push campaign from Admin → Push notifications.
 *
 * Sending happens in the background (lib/push/campaigns): subscribers are
 * walked in _id order in batches, and `cursor` + `heartbeatAt` let another
 * process resume a send if the one running it stops. Engagement (delivered,
 * clicked) is reported by the service worker.
 */
import mongoose, { Schema, type Document } from "mongoose";

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";

export type Audience = {
  /** Who: everyone, signed-in users, guests, sellers, buyers, or listed people. */
  who: "all" | "users" | "guests" | "sellers" | "buyers" | "specific";
  cityIds?: string[];
  areaIds?: string[];
  states?: string[];
  devices?: string[];
  browsers?: string[];
  os?: string[];
  userIds?: string[];
  /** Only devices seen on the site within N days (0 = any). */
  activeWithinDays?: number;
};

export interface IPushCampaign extends Document {
  name: string;
  title: string;
  body: string;
  url: string;
  icon: string | null;
  image: string | null;
  actions: { title: string; url: string }[];
  requireInteraction: boolean;
  ttlHours: number;
  urgency: "very-low" | "low" | "normal" | "high";
  audience: Audience;
  status: CampaignStatus;
  sendAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  lockedBy: string | null;
  cursor: mongoose.Types.ObjectId | null;
  stats: { targeted: number; sent: number; failed: number; removed: number; delivered: number; clicked: number; closed: number };
  error: string | null;
  createdBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const PushCampaignSchema = new Schema<IPushCampaign>(
  {
    name: { type: String, default: "" },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: "", maxlength: 400 },
    url: { type: String, default: "/" },
    icon: { type: String, default: null },
    image: { type: String, default: null },
    actions: { type: [{ title: String, url: String, _id: false }], default: [] },
    requireInteraction: { type: Boolean, default: false },
    ttlHours: { type: Number, default: 24 },
    urgency: { type: String, enum: ["very-low", "low", "normal", "high"], default: "normal" },
    audience: { type: Schema.Types.Mixed, default: { who: "all" } },
    status: { type: String, enum: ["draft", "scheduled", "sending", "sent", "cancelled", "failed"], default: "draft" },
    sendAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    heartbeatAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },
    cursor: { type: Schema.Types.ObjectId, default: null },
    stats: {
      targeted: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      removed: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      closed: { type: Number, default: 0 },
    },
    error: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

PushCampaignSchema.index({ createdAt: -1 });
PushCampaignSchema.index({ status: 1, sendAt: 1 });

if (mongoose.models.PushCampaign) mongoose.deleteModel("PushCampaign");
export default mongoose.model<IPushCampaign>("PushCampaign", PushCampaignSchema);
