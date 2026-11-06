/**
 * BlogPost Model — editorial/SEO content managed from admin, shown at /blog.
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IBlogPost extends Document {
  title: string;
  slug: string;
  excerpt?: string;
  content: string; // HTML
  coverImage?: string;
  category?: string;
  seoTitle?: string;
  seoDescription?: string;
  status: "draft" | "published";
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BlogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    excerpt: { type: String, default: null },
    content: { type: String, default: "" },
    coverImage: { type: String, default: null },
    category: { type: String, default: "General" },
    seoTitle: { type: String, default: null },
    seoDescription: { type: String, default: null },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BlogPostSchema.index({ status: 1, publishedAt: -1 });

export default mongoose.models.BlogPost ||
  mongoose.model<IBlogPost>("BlogPost", BlogPostSchema);
