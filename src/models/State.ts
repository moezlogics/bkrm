/**
 * State / Province Model (e.g. Punjab, Sindh).
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IState extends Document {
  name: string;
  slug: string;
  countryId: mongoose.Types.ObjectId;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const StateSchema = new Schema<IState>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    countryId: { type: Schema.Types.ObjectId, ref: "Country", required: true },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

StateSchema.index({ countryId: 1 });
StateSchema.index({ slug: 1 });
StateSchema.index({ isActive: 1, order: 1 });

export default mongoose.models.State ||
  mongoose.model<IState>("State", StateSchema);
