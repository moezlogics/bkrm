/**
 * Slider Model
 *
 * Homepage carousel/banner images.
 * Can optionally deep-link to a listing or an external third-party URL.
 * `sequence` controls display order.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface ISlider extends Document {
  image: string;
  sequence: number;
  thirdPartyLink?: string;
  itemId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const SliderSchema = new Schema<ISlider>(
  {
    image: { type: String, required: true },
    sequence: { type: Number, default: 0 },
    thirdPartyLink: { type: String, default: null },
    itemId: { type: Schema.Types.ObjectId, ref: "Listing", default: null },
  },
  { timestamps: true }
);

SliderSchema.index({ sequence: 1 });

export default mongoose.models.Slider ||
  mongoose.model<ISlider>("Slider", SliderSchema);
