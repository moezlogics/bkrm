/**
 * Country Model — top of the location hierarchy.
 * Pilot ships with Pakistan only, but the taxonomy is multi-country ready.
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface ICountry extends Document {
  name: string;
  slug: string;
  code: string; // ISO 3166-1 alpha-2 (e.g. PK)
  currency: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const CountrySchema = new Schema<ICountry>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    code: { type: String, default: "PK", uppercase: true },
    currency: { type: String, default: "PKR" },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CountrySchema.index({ isActive: 1, order: 1 });

export default mongoose.models.Country ||
  mongoose.model<ICountry>("Country", CountrySchema);
