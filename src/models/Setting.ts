/**
 * Setting Model
 *
 * Key-value store for application-wide configuration.
 * Supports string values and file references (e.g., logo, favicon).
 * Each key is unique.
 */

import mongoose, { Schema, type Document } from "mongoose";

export interface ISetting extends Document {
  key: string;
  value: string;
  type: "string" | "file";
  createdAt: Date;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: String, required: true },
    type: {
      type: String,
      enum: ["string", "file"],
      default: "string",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Setting ||
  mongoose.model<ISetting>("Setting", SettingSchema);
