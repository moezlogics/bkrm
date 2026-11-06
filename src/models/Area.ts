/**
 * Area / Neighbourhood Model (e.g. Gulgasht Colony within Multan).
 * Slug is unique WITHIN a city (compound unique on citySlug + slug).
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IArea extends Document {
  name: string;
  slug: string;
  cityId: mongoose.Types.ObjectId;
  citySlug: string; // denormalized for fast lookups + compound uniqueness
  latitude?: number;
  longitude?: number;
  content?: string;
  featuredImage?: string;
  isActive: boolean;
  listingCount: number;
  source?: "admin" | "user";
  addedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const AreaSchema = new Schema<IArea>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    cityId: { type: Schema.Types.ObjectId, ref: "City", required: true },
    citySlug: { type: String, required: true, lowercase: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    content: { type: String, default: null },
    featuredImage: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    listingCount: { type: Number, default: 0 },
    // "user" = added by a seller while posting (admin can review/merge); "admin" = curated
    source: { type: String, enum: ["admin", "user"], default: "admin" },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

AreaSchema.index({ cityId: 1 });
AreaSchema.index({ citySlug: 1, slug: 1 }, { unique: true });

export default mongoose.models.Area ||
  mongoose.model<IArea>("Area", AreaSchema);
