/**
 * User Model
 *
 * Stores registered users (both email and social login).
 * Social login users go through onboarding to add phone number.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  emailVerified: boolean;
  password?: string;
  phoneNumber?: string;
  profileImage?: string;
  provider: "credentials" | "google" | "facebook";
  providerId?: string;
  city?: string;
  area?: string;
  state?: string;
  country: string;
  bio?: string;
  fcmToken?: string;
  role: "user" | "admin";
  isBlocked: boolean;
  /** Why the account was blocked (admin's words), and when. */
  blockReason?: string | null;
  blockedAt?: Date | null;
  /** "Sign out everywhere": sessions from sign-ins before this are refused (lib/account-state). */
  sessionsRevokedAt?: Date | null;
  /** Private note for the admin team, never shown to the member. */
  adminNote?: string | null;
  lastLoginAt?: Date | null;
  lastLoginIp?: string | null;
  onboardingCompleted: boolean;
  isSeller: boolean; // false = buyer mode; flips true when they post their first ad
  isDemo?: boolean;
  /** Push categories this person has switched off (see lib/push/config). */
  pushOff?: string[];
  /** Non-urgent pushes sent today (daily cap), keyed by Pakistan-time day. */
  pushDay?: string | null;
  pushDayCount?: number;

  // ── Trust & reputation ──
  isPhoneVerified: boolean;
  isCnicVerified: boolean;
  cnicImage?: string;
  selfieImage?: string;
  // 0 = new, 1 = phone-verified, 2 = ID-verified, 3 = verified shop
  verificationLevel: 0 | 1 | 2 | 3;

  // ── ID verification workflow (seller submits doc pictures → admin approves) ──
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  verificationDoc?: {
    docType?: "cnic" | "passport" | "license";
    fullName?: string;
    cnicNumber?: string;
    frontImage?: string;
    backImage?: string;
    selfieImage?: string;
    submittedAt?: Date;
    reviewedAt?: Date;
    rejectionReason?: string;
  };
  rating: number;
  ratingCount: number;
  salesCount: number;
  responseTimeMins: number;
  sellerHealthScore: number;

  // ── Reseller / shop ──
  isShop: boolean;
  shopName?: string;
  shopSlug?: string;
  shopAddress?: string;
  shopLogo?: string;
  shopBanner?: string;
  shopDescription?: string;

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: { type: Boolean, default: false },
    password: { type: String, select: false }, // hashed, hidden by default
    phoneNumber: { type: String, default: null },
    profileImage: { type: String, default: null },
    provider: {
      type: String,
      enum: ["credentials", "google", "facebook"],
      default: "credentials",
    },
    providerId: { type: String, default: null },
    city: { type: String, default: null },
    area: { type: String, default: null },
    bio: { type: String, default: null, maxlength: 300 },
    state: { type: String, default: null },
    country: { type: String, default: "Pakistan" },
    fcmToken: { type: String, default: null },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isBlocked: { type: Boolean, default: false },
    blockReason: { type: String, default: null, maxlength: 500 },
    blockedAt: { type: Date, default: null },
    sessionsRevokedAt: { type: Date, default: null },
    adminNote: { type: String, default: null, maxlength: 2000 },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    onboardingCompleted: { type: Boolean, default: false },
    isSeller: { type: Boolean, default: false },
    // Sample accounts created by first-run setup (lib/setup) — removable in one go.
    isDemo: { type: Boolean, default: false },
    pushOff: { type: [String], default: [] },
    pushDay: { type: String, default: null },
    pushDayCount: { type: Number, default: 0 },

    // ── Trust & reputation ──
    isPhoneVerified: { type: Boolean, default: false },
    isCnicVerified: { type: Boolean, default: false },
    cnicImage: { type: String, default: null },
    selfieImage: { type: String, default: null },
    verificationLevel: { type: Number, enum: [0, 1, 2, 3], default: 0 },
    verificationStatus: {
      type: String,
      enum: ["unverified", "pending", "verified", "rejected"],
      default: "unverified",
    },
    verificationDoc: {
      docType: { type: String, enum: ["cnic", "passport", "license", null], default: null },
      fullName: { type: String, default: null },
      cnicNumber: { type: String, default: null },
      frontImage: { type: String, default: null },
      backImage: { type: String, default: null },
      selfieImage: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: null },
    },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },
    responseTimeMins: { type: Number, default: 0 },
    sellerHealthScore: { type: Number, default: 0 },

    // ── Reseller / shop ──
    isShop: { type: Boolean, default: false },
    shopName: { type: String, default: null },
    shopSlug: { type: String, default: null },
    shopAddress: { type: String, default: null },
    shopLogo: { type: String, default: null },
    shopBanner: { type: String, default: null },
    shopDescription: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
// Admin user list (newest first) and phone lookups.
UserSchema.index({ createdAt: -1 });
UserSchema.index({ phoneNumber: 1 }, { sparse: true });
UserSchema.index({ verificationLevel: 1 });
// One CNIC verifies one account (lookup when a seller sends theirs).
UserSchema.index({ "verificationDoc.cnicNumber": 1 }, { sparse: true });
UserSchema.index({ isShop: 1 });
// Unique only for real (string) shop slugs — null shopSlug docs are excluded,
// so multiple users without a shop don't collide.
UserSchema.index(
  { shopSlug: 1 },
  { unique: true, partialFilterExpression: { shopSlug: { $type: "string" } } }
);

// HMR-safe (see nextjs16-gotchas): re-register so new fields apply without restart.
if (mongoose.models.User) mongoose.deleteModel("User");
export default mongoose.model<IUser>("User", UserSchema);
