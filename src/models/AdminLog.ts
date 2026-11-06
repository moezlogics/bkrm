/**
 * AdminLog: what an admin did, when, and to what.
 *
 * Written by lib/admin-log for every action that changes someone's account,
 * an ad's status, money or the site's settings, so a team of admins can see
 * who approved, blocked, refunded or deleted what. The admin's name and the
 * target's label are copied in, so a row still reads correctly after the
 * account or ad is gone. Rows are kept for a year.
 */
import mongoose, { Schema, type Document } from "mongoose";

export interface IAdminLog extends Document {
  adminId?: mongoose.Types.ObjectId | null;
  adminName: string;
  adminEmail: string;
  /** e.g. "user.block", "listing.approve", "invoice.approve", "settings.update". */
  action: string;
  targetType: "user" | "listing" | "invoice" | "report" | "verification" | "settings" | "plan" | "site" | "booking";
  targetId?: string | null;
  targetLabel?: string | null;
  /** One line a person can read: "Blocked: spam ads (hid 4 live ads)". */
  details?: string | null;
  ip?: string | null;
  createdAt: Date;
}

const AdminLogSchema = new Schema<IAdminLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    adminName: { type: String, default: "" },
    adminEmail: { type: String, default: "" },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    targetLabel: { type: String, default: null },
    details: { type: String, default: null, maxlength: 1000 },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Newest first; rows older than a year are removed by MongoDB itself.
AdminLogSchema.index({ createdAt: -1 }, { expireAfterSeconds: 365 * 24 * 3600 });
AdminLogSchema.index({ adminId: 1, createdAt: -1 });
AdminLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AdminLogSchema.index({ action: 1, createdAt: -1 });

if (mongoose.models.AdminLog) mongoose.deleteModel("AdminLog");
export default mongoose.model<IAdminLog>("AdminLog", AdminLogSchema);
