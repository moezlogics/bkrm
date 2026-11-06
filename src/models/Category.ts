/**
 * Category Model
 *
 * Hierarchical category system supporting infinite nesting:
 *   Cars -> Toyota -> Toyota Corolla
 *
 * parentCategoryId = null means it's a root category.
 *
 * Per-category config (listingType / priceMode / conditionSet / urlFacetKeys)
 * makes category behaviour data-driven, so adding a new vertical (Cars, Jobs,
 * Property) is admin data-entry — no code change, no deploy.
 */

import mongoose, { Schema, type Document } from "mongoose";

export type ListingType = "item" | "vehicle" | "property" | "job" | "service";
export type PriceMode =
  | "fixed"
  | "negotiable"
  | "free"
  | "contact"
  | "range"
  | "salary"
  | "none";

export interface ICategory extends Document {
  name: string;
  slug: string;
  image?: string;
  icon?: string;
  path?: string; // materialized slug path e.g. "vehicles/cars"
  sequence: number;
  parentCategoryId: mongoose.Types.ObjectId | null;
  description?: string;
  status: boolean;

  // ── Per-category config ──
  listingType: ListingType;
  priceMode: PriceMode;
  conditionSet: string[]; // [] = no condition shown (Jobs/Property)
  showCondition: boolean;
  urlFacetKeys: string[]; // custom-field slugs eligible for indexable facet URLs
  indexableArea: boolean;
  freeAdQuota?: number | null; // per-category free posting limit; null = inherit global

  // ── SEO ──
  seoTitle?: string;
  seoDescription?: string;
  content?: string; // editorial HTML body for the category hub page

  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    image: { type: String, default: null }, // optional: text/icon-only verticals (Jobs/Services)
    icon: { type: String, default: null },
    path: { type: String, default: null },
    sequence: { type: Number, default: 0 },
    parentCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    description: { type: String, default: null },
    status: { type: Boolean, default: true },

    // ── Per-category config ──
    listingType: {
      type: String,
      enum: ["item", "vehicle", "property", "job", "service"],
      default: "item",
    },
    priceMode: {
      type: String,
      enum: ["fixed", "negotiable", "free", "contact", "range", "salary", "none"],
      default: "fixed",
    },
    conditionSet: { type: [String], default: ["used", "new"] },
    showCondition: { type: Boolean, default: true },
    urlFacetKeys: { type: [String], default: [] },
    indexableArea: { type: Boolean, default: true },
    freeAdQuota: { type: Number, default: null },

    // ── SEO ──
    seoTitle: { type: String, default: null },
    seoDescription: { type: String, default: null },
    content: { type: String, default: null },
  },
  { timestamps: true }
);

CategorySchema.index({ parentCategoryId: 1 });
CategorySchema.index({ sequence: 1 });
CategorySchema.index({ path: 1 });

export default mongoose.models.Category ||
  mongoose.model<ICategory>("Category", CategorySchema);
