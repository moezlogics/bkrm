/**
 * Faq Model — admin-managed FAQ entries, rendered at /faq with FAQPage JSON-LD.
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IFaq extends Document {
  question: string;
  answer: string;
  category?: string;
  sequence: number;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FaqSchema = new Schema<IFaq>(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: { type: String, default: "General" },
    sequence: { type: Number, default: 0 },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

FaqSchema.index({ status: 1, sequence: 1 });

export default mongoose.models.Faq || mongoose.model<IFaq>("Faq", FaqSchema);
