/**
 * BlockedUser Model
 *
 * Tracks user-to-user blocking relationships.
 * Unique compound index on [userId, blockedUserId] prevents duplicate entries.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IBlockedUser extends Document {
  userId: mongoose.Types.ObjectId;
  blockedUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BlockedUserSchema = new Schema<IBlockedUser>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blockedUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

BlockedUserSchema.index({ userId: 1, blockedUserId: 1 }, { unique: true });
BlockedUserSchema.index({ userId: 1 });

export default mongoose.models.BlockedUser ||
  mongoose.model<IBlockedUser>("BlockedUser", BlockedUserSchema);
