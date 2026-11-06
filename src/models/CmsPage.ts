/**
 * CmsPage Model — static/legal content pages (About, Privacy, Terms, Safety…)
 * managed from the admin and rendered at /page/[slug].
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface ICmsPage extends Document {
  title: string;
  slug: string;
  content: string; // HTML
  seoTitle?: string;
  seoDescription?: string;
  status: boolean;
  showInFooter: boolean;
  sequence: number;
  createdAt: Date;
  updatedAt: Date;
}

const CmsPageSchema = new Schema<ICmsPage>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    content: { type: String, default: "" },
    seoTitle: { type: String, default: null },
    seoDescription: { type: String, default: null },
    status: { type: Boolean, default: true },
    showInFooter: { type: Boolean, default: true },
    sequence: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CmsPageSchema.index({ status: 1, sequence: 1 });

export default mongoose.models.CmsPage ||
  mongoose.model<ICmsPage>("CmsPage", CmsPageSchema);
