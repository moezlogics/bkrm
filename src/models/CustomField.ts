/**
 * CustomField Model
 *
 * Dynamic, per-category form fields — the attribute registry that lets the
 * platform support arbitrary verticals (Cars: make/model/year/mileage;
 * Property: bedrooms/area; Jobs: salary) without schema changes.
 *
 * Values for a listing are stored in Listing.customFieldValues (Map) keyed by slug.
 * Dropdown/radio/multiselect store selectable options in `values`.
 * Dependent enums (model depends on make) use dependsOnSlug + dependsOnValueMap.
 */

import mongoose, { Schema, type Document } from "mongoose";

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "decimal"
  | "dropdown"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "boolean"
  | "date"
  | "range"
  | "year";

export interface ICustomField extends Document {
  name: string;
  slug: string;
  type: CustomFieldType;
  required: boolean;
  values: string[];
  minLength?: number;
  maxLength?: number;
  image?: string;
  categoryIds: mongoose.Types.ObjectId[];
  status: boolean;

  // ── OLX-parity metadata ──
  unit?: string; // "km", "cc", "Marla", "sq ft"
  placeholder?: string;
  helpText?: string;
  group?: string; // section grouping in the wizard ("Engine", "Location")
  sequence: number;
  filterable: boolean; // appears in the filter sidebar
  searchable: boolean; // included in keyword search
  urlFacet: boolean; // eligible for indexable facet URL (e.g. brand)
  min?: number | null; // numeric/range/year bounds
  max?: number | null;
  dependsOnSlug?: string | null; // dependent enums (model depends on make)
  dependsOnValueMap?: Record<string, string[]> | null;
  // Sellers may type their own option ("Other") for choice fields — e.g. a
  // colour or warranty we didn't list. It's saved to `values` so the next
  // seller can pick it; `userAddedValues` lets the admin review them.
  allowCustom: boolean;
  userAddedValues: string[];

  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldSchema = new Schema<ICustomField>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    type: {
      type: String,
      enum: [
        "text",
        "textarea",
        "number",
        "decimal",
        "dropdown",
        "multiselect",
        "checkbox",
        "radio",
        "boolean",
        "date",
        "range",
        "year",
      ],
      required: true,
    },
    required: { type: Boolean, default: false },
    values: [{ type: String }],
    minLength: { type: Number, default: null },
    maxLength: { type: Number, default: null },
    image: { type: String, default: null },
    categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    status: { type: Boolean, default: true },

    // ── OLX-parity metadata ──
    unit: { type: String, default: null },
    placeholder: { type: String, default: null },
    helpText: { type: String, default: null },
    group: { type: String, default: null },
    sequence: { type: Number, default: 0 },
    filterable: { type: Boolean, default: false },
    searchable: { type: Boolean, default: false },
    urlFacet: { type: Boolean, default: false },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    dependsOnSlug: { type: String, default: null },
    dependsOnValueMap: { type: Schema.Types.Mixed, default: null },
    allowCustom: { type: Boolean, default: true },
    userAddedValues: [{ type: String }],
  },
  { timestamps: true }
);

CustomFieldSchema.index({ slug: 1 });
CustomFieldSchema.index({ categoryIds: 1 });
CustomFieldSchema.index({ status: 1 });

export default mongoose.models.CustomField ||
  mongoose.model<ICustomField>("CustomField", CustomFieldSchema);
