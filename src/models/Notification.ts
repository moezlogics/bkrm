/**
 * Notification Model
 *
 * Push / in-app notifications sent to users.
 * Can target all users (`sendTo: 'all'`) or a selected subset
 * via `userIds`. Optionally links to a specific listing.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface INotification extends Document {
  title: string;
  message: string;
  image?: string;
  itemId?: mongoose.Types.ObjectId | null;
  sendTo: "all" | "selected";
  userIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    image: { type: String, default: null },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", default: null },
    sendTo: {
      type: String,
      enum: ["all", "selected"],
      default: "all",
    },
    userIds: [{ type: String }],
  },
  { timestamps: true }
);

NotificationSchema.index({ sendTo: 1 });
NotificationSchema.index({ createdAt: -1 });

export default mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);
