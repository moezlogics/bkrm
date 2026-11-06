/**
 * Favourite Model
 *
 * Tracks which listings a user has saved/bookmarked.
 * Unique compound index on [userId, itemId] prevents duplicates.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IFavourite extends Document {
  userId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FavouriteSchema = new Schema<IFavourite>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
  },
  { timestamps: true }
);

FavouriteSchema.index({ userId: 1, itemId: 1 }, { unique: true });
FavouriteSchema.index({ userId: 1 });
// "Who saved this ad" — price-drop alerts go to everyone who saved it.
FavouriteSchema.index({ itemId: 1 });

export default mongoose.models.Favourite ||
  mongoose.model<IFavourite>("Favourite", FavouriteSchema);
