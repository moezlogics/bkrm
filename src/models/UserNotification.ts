/**
 * A person's in-app notifications (the bell): every automatic notification is
 * stored here as well as pushed, so it reaches people who never allowed push
 * on their phone, and nobody loses one that arrived while they were away.
 *
 * Written by lib/push/notify (pushToUsers). Kept for 120 days.
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IUserNotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  body: string;
  url: string;
  icon?: string | null;
  readAt?: Date | null;
  createdAt: Date;
}

const UserNotificationSchema = new Schema<IUserNotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 600 },
    url: { type: String, default: "/" },
    icon: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

UserNotificationSchema.index({ userId: 1, createdAt: -1 });
UserNotificationSchema.index({ userId: 1, readAt: 1 });
UserNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 86_400 });

export default (mongoose.models.UserNotification as mongoose.Model<IUserNotification>) ||
  mongoose.model<IUserNotification>("UserNotification", UserNotificationSchema);
