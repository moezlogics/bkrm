/**
 * Listing Model
 *
 * Core classified ad entity (generic, multi-category). Each listing belongs to
 * a user and a category. Category-specific attributes (year, mileage, fuel,
 * transmission, etc.) live in `customFieldValues` (Map), driven by the
 * CustomField registry — NOT first-class columns.
 *
 * Supports GeoJSON Point for proximity queries (2dsphere) and text search.
 */

import mongoose, { Schema, type Document } from "mongoose";
import { listingKeywords } from "@/lib/keywords-core.mjs";
import Category from "./Category";

export type PriceMode =
  | "fixed"
  | "negotiable"
  | "free"
  | "contact"
  | "range"
  | "salary";

export interface IListing extends Document {
  name: string;
  slug: string;
  description?: string;

  // ── Pricing (category-driven) ──
  price?: number | null;
  previousPrice?: number | null;
  priceDroppedAt?: Date | null;
  priceMode: PriceMode;
  priceMax?: number | null; // salary/price ranges
  currency: string;

  mainImage?: string;
  galleryImages: string[];
  watermarkImage?: string;
  videoLink?: string;

  // ── Location (denormalized strings for fast browse + FK refs for integrity) ──
  address?: string;
  city?: string;
  state?: string;
  country: string;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  locationRefs: {
    cityId?: mongoose.Types.ObjectId | null;
    areaId?: mongoose.Types.ObjectId | null;
    stateId?: mongoose.Types.ObjectId | null;
  };

  contactNumber?: string;
  whatsappNumber?: string;
  userId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  allCategoryIds: string[];
  /** Normalised search keywords (title, category chain, key specs) — see lib/keywords. */
  kw?: string[];
  status: "review" | "approved" | "rejected" | "sold out" | "expired";
  clicks: number;
  impressions: number;
  favouritesCount: number;
  /** Leads: taps on Call, WhatsApp and Live Chat (lib/counters). */
  phoneClicks: number;
  whatsappClicks: number;
  chatClicks: number;
  condition?: string | null;

  // ── Lifecycle ──
  expiresAt?: Date | null;
  soldAt?: Date | null;
  bumpedAt?: Date | null;
  isUrgent: boolean;
  showOnlyToPremium: boolean;
  isFeatured: boolean;
  featuredExpiresAt?: Date | null;

  // ── SEO ──
  seoTitle?: string;
  seoDescription?: string;

  // ── Moderation / spam brain ──
  spamScore: number;
  isDemo?: boolean;
  /** Hidden because the seller was blocked (lib/user-admin); unblocking restores it. */
  blockHidden?: boolean;
  flagReasons: string[];

  customFieldValues: Map<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ListingSchema = new Schema<IListing>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: null },

    // ── Pricing ──
    price: { type: Number, default: null }, // optional: Jobs/Services/Free verticals
    previousPrice: { type: Number, default: null },
    priceDroppedAt: { type: Date, default: null },
    priceMode: {
      type: String,
      enum: ["fixed", "negotiable", "free", "contact", "range", "salary"],
      default: "fixed",
    },
    priceMax: { type: Number, default: null },
    currency: { type: String, default: "PKR" },

    mainImage: { type: String, default: null },
    galleryImages: [{ type: String }],
    watermarkImage: { type: String, default: null },
    videoLink: { type: String, default: null },

    // ── Location ──
    address: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: "Pakistan" },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    locationRefs: {
      cityId: { type: Schema.Types.ObjectId, ref: "City", default: null },
      areaId: { type: Schema.Types.ObjectId, ref: "Area", default: null },
      stateId: { type: Schema.Types.ObjectId, ref: "State", default: null },
    },

    contactNumber: { type: String, default: null },
    whatsappNumber: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    allCategoryIds: [{ type: String }],
    // Search keywords, filled by the pre-save hook below. Never sent to clients.
    kw: { type: [String], default: undefined, select: false },
    status: {
      type: String,
      enum: ["review", "approved", "rejected", "sold out", "expired"],
      default: "review",
    },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    favouritesCount: { type: Number, default: 0 },
    phoneClicks: { type: Number, default: 0 },
    whatsappClicks: { type: Number, default: 0 },
    chatClicks: { type: Number, default: 0 },
    condition: {
      type: String,
      enum: ["new", "used", "refurbished", "for-parts", null],
      default: null,
    },

    // ── Lifecycle ──
    expiresAt: { type: Date, default: null },
    soldAt: { type: Date, default: null },
    bumpedAt: { type: Date, default: null },
    isUrgent: { type: Boolean, default: false },
    showOnlyToPremium: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    featuredExpiresAt: { type: Date, default: null },

    // ── SEO ──
    seoTitle: { type: String, default: null },
    seoDescription: { type: String, default: null },

    // ── Moderation / spam brain ──
    spamScore: { type: Number, default: 0 },
    // Sample ads from first-run setup (lib/setup) — removable in one go.
    isDemo: { type: Boolean, default: false },
    blockHidden: { type: Boolean, default: undefined },
    flagReasons: { type: [String], default: [] },

    customFieldValues: { type: Map, of: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ListingSchema.index({ location: "2dsphere" });
ListingSchema.index({ userId: 1 });
ListingSchema.index({ categoryId: 1 });
ListingSchema.index({ status: 1 });
ListingSchema.index({ status: 1, expiresAt: 1 });
ListingSchema.index({ isFeatured: 1, featuredExpiresAt: 1 });
ListingSchema.index({ categoryId: 1, status: 1, isFeatured: -1, createdAt: -1 });
ListingSchema.index({ "locationRefs.cityId": 1, categoryId: 1, status: 1 });

// ── Browse/feed hot paths ──
// Homepage + "latest" feeds: {status} sorted by {isFeatured,createdAt}.
ListingSchema.index({ status: 1, isFeatured: -1, createdAt: -1 });
// Archive drill-down by brand/model — `allCategoryIds` is the taxonomy rollup
// every /<category-path> page filters on (previously unindexed = collection scan).
ListingSchema.index({ allCategoryIds: 1, status: 1, isFeatured: -1, createdAt: -1 });
// City/area-scoped archives and the location-personalised homepage feed.
ListingSchema.index({ "locationRefs.cityId": 1, status: 1, isFeatured: -1, createdAt: -1 });
ListingSchema.index({ "locationRefs.areaId": 1, status: 1, isFeatured: -1, createdAt: -1 });

// Search: keyword lookup, newest first (see lib/keywords).
ListingSchema.index({ kw: 1, status: 1, createdAt: -1 });
// Seller dashboard / public shop: one seller's ads, newest first.
ListingSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Admin: newest ads overall and per moderation status (review queue…).
ListingSchema.index({ createdAt: -1 });
ListingSchema.index({ status: 1, createdAt: -1 });
// Price-sorted archives (national, section/brand/model, city).
ListingSchema.index({ status: 1, price: 1 });
ListingSchema.index({ allCategoryIds: 1, status: 1, price: 1 });
ListingSchema.index({ "locationRefs.cityId": 1, status: 1, price: 1 });

// An ad going live again (relisted after a sale, restored by a moderator) gets a
// fresh expiry period (lib/listing-expiry dates it) instead of being expired
// again at once because of its old date.
ListingSchema.pre("save", function () {
  const doc = this as any;
  if (doc.isModified("status") && doc.status === "approved" && doc.expiresAt && +new Date(doc.expiresAt) <= Date.now()) {
    doc.expiresAt = null;
  }
});

// Keep the category rollup and `kw` in step with what archives and search read.
ListingSchema.pre("save", async function () {
  const doc = this as unknown as IListing;
  if (!doc.isNew && !["name", "allCategoryIds", "categoryId", "customFieldValues", "condition"].some((f) => doc.isModified(f))) return;
  const cats = new Map<string, { name: string; parentCategoryId?: unknown }>();
  {
    // Every archive filters on allCategoryIds ([section, brand, model]); fill it
    // for any writer that only set categoryId.
    if (!doc.allCategoryIds?.length && doc.categoryId) {
      const chain: string[] = [];
      let id: unknown = doc.categoryId;
      for (let depth = 0; id && depth < 6; depth++) {
        const c: any = await Category.findById(id).select("name parentCategoryId").lean();
        if (!c) break;
        chain.unshift(String(c._id));
        cats.set(String(c._id), c);
        id = c.parentCategoryId;
      }
      doc.allCategoryIds = chain;
    }
    const missing = (doc.allCategoryIds || []).map(String).filter((i) => !cats.has(i) && mongoose.isValidObjectId(i));
    if (missing.length) {
      for (const c of (await Category.find({ _id: { $in: missing } }).select("name").lean()) as any[]) cats.set(String(c._id), c);
    }
  }
  const names = (doc.allCategoryIds || []).map((i) => cats.get(String(i))?.name).filter(Boolean) as string[];
  doc.kw = listingKeywords({ name: doc.name, categoryNames: names, specs: doc.customFieldValues, condition: doc.condition });
});

// Live-ad counts (lib/scope-counts) follow status changes instantly: note the
// status a document was loaded with, and report going live / leaving.
ListingSchema.post("init", function () {
  (this as any).$locals.loadedStatus = (this as any).status;
  (this as any).$locals.loadedPrice = (this as any).price;
});
ListingSchema.post("save", function () {
  const doc = this as any;
  const was = doc.$locals.loadedStatus === "approved";
  const now = doc.status === "approved";
  const before = { status: doc.$locals.loadedStatus, price: doc.$locals.loadedPrice };
  doc.$locals.loadedStatus = doc.status;
  doc.$locals.loadedPrice = doc.price;
  if (was !== now) (globalThis as any).__listingScopeDelta?.(doc, now ? 1 : -1);
  // Push notifications (approved / rejected → seller, price drop → savers),
  // via a hook because lib/push imports this model.
  if (!doc.$locals.skipPush) (globalThis as any).__listingPush?.(doc, before);
});

// Re-register on HMR so schema edits (new fields) take effect without a full
// restart — the default `models.X || model(...)` cache otherwise strips them.
if (mongoose.models.Listing) mongoose.deleteModel("Listing");
export default mongoose.model<IListing>("Listing", ListingSchema);
