/**
 * ChatMessage Model
 *
 * In-app messaging between buyers and sellers.
 * Messages are scoped to a listing (itemId) and optionally linked to an offer.
 * Supports text, file attachments, and audio messages.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IChatMessage extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  offerId?: mongoose.Types.ObjectId | null;
  message?: string | null;
  fileUrl?: string;
  audioUrl?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    offerId: { type: Schema.Types.ObjectId, ref: "Offer", default: null },
    message: { type: String, default: null },
    fileUrl: { type: String, default: null },
    audioUrl: { type: String, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ senderId: 1, receiverId: 1, itemId: 1 });
ChatMessageSchema.index({ receiverId: 1, isRead: 1 });
ChatMessageSchema.index({ itemId: 1 });

export default mongoose.models.ChatMessage ||
  mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
