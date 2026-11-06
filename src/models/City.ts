/**
 * City Model — primary browse + location-SEO unit (Foodies-style).
 * Listings link by denormalized string (Listing.city) + FK (locationRefs.cityId).
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface ICity extends Document {
  name: string;
  slug: string;
  stateId?: mongoose.Types.ObjectId | null;
  stateName?: string;
  latitude?: number;
  longitude?: number;
  image?: string;
  featuredImage?: string;
  content?: string; // editorial HTML for the city landing page (SEO)
  order: number;
  isActive: boolean;
  listingCount: number;
  source?: "admin" | "user";
  addedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const CitySchema = new Schema<ICity>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    stateId: { type: Schema.Types.ObjectId, ref: "State", default: null },
    stateName: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    image: { type: String, default: null },
    featuredImage: { type: String, default: null },
    content: { type: String, default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    listingCount: { type: Number, default: 0 },
    // "user" = added by a seller while posting (admin can review/merge); "admin" = curated
    source: { type: String, enum: ["admin", "user"], default: "admin" },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

CitySchema.index({ isActive: 1, order: 1 });
CitySchema.index({ stateId: 1 });

export default mongoose.models.City ||
  mongoose.model<ICity>("City", CitySchema);
