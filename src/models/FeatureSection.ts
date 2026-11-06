/**
 * FeatureSection Model
 *
 * Admin-configurable homepage sections that display listings
 * based on filters (e.g., category, location), price ranges,
 * and different display styles (grid, carousel, etc.).
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IFeatureSection extends Document {
  title: string;
  sequence: number;
  filter?: string;
  value?: string;
  style?: string;
  minPrice?: number;
  maxPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

const FeatureSectionSchema = new Schema<IFeatureSection>(
  {
    title: { type: String, required: true, trim: true },
    sequence: { type: Number, default: 0 },
    filter: { type: String, default: null },
    value: { type: String, default: null },
    style: { type: String, default: null },
    minPrice: { type: Number, default: null },
    maxPrice: { type: Number, default: null },
  },
  { timestamps: true }
);

FeatureSectionSchema.index({ sequence: 1 });

export default mongoose.models.FeatureSection ||
  mongoose.model<IFeatureSection>("FeatureSection", FeatureSectionSchema);
