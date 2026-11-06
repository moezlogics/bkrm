/**
 * Media Model — the media library (WordPress-style).
 *
 * Every uploaded image is recorded here, so it can be browsed, re-used,
 * captioned and deleted from one place instead of pasting URLs around.
 *
 * `folder` groups uploads by purpose (listings, branding, blog …) for the
 * library filter. Private media (ID documents, payment screenshots) is never
 * served publicly — only its owner and admins can load it.
 */
import mongoose, { Schema, type Document } from "mongoose";

export const MEDIA_FOLDERS = [
  "general", "listings", "profile", "shop", "branding", "blog", "categories",
  "locations", "sliders", "notifications", "verification", "payments",
] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export interface IMedia extends Document {
  url: string;
  thumbUrl: string;
  key: string; // storage key (local path or CDN filename) — used to delete the file
  driver: "local" | "cdn";
  mime: string;
  kind: "image" | "video" | "pdf";
  width: number;
  height: number;
  sizeBytes: number;
  originalName: string;
  title: string;
  alt: string;
  caption: string;
  /** Where `alt` came from: the AI, a person, or a fallback built from context. */
  altSource: "ai" | "user" | "auto";
  aiStatus: "pending" | "done" | "failed" | "skipped";
  placeholder: string; // tiny blur-up image (data URL)
  color: string;       // dominant colour
  folder: MediaFolder;
  isPrivate: boolean;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema = new Schema<IMedia>(
  {
    url: { type: String, required: true },
    thumbUrl: { type: String, required: true },
    key: { type: String, required: true },
    driver: { type: String, enum: ["local", "cdn"], default: "local" },
    mime: { type: String, default: "image/webp" },
    kind: { type: String, enum: ["image", "video", "pdf"], default: "image" },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    originalName: { type: String, default: "" },
    title: { type: String, default: "", trim: true },
    alt: { type: String, default: "", trim: true },
    caption: { type: String, default: "", trim: true },
    altSource: { type: String, enum: ["ai", "user", "auto"], default: "auto" },
    aiStatus: { type: String, enum: ["pending", "done", "failed", "skipped"], default: "skipped" },
    placeholder: { type: String, default: "" },
    color: { type: String, default: "" },
    folder: { type: String, enum: MEDIA_FOLDERS, default: "general" },
    isPrivate: { type: Boolean, default: false },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

MediaSchema.index({ uploadedBy: 1, createdAt: -1 });
MediaSchema.index({ folder: 1, createdAt: -1 });
MediaSchema.index({ url: 1 });
MediaSchema.index({ key: 1 });

if (mongoose.models.Media) mongoose.deleteModel("Media");
export default mongoose.model<IMedia>("Media", MediaSchema);
