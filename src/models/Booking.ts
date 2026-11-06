/**
 * A booking on an ad that can be booked (lib/bookings): a provider's time
 * (qasai, transport…) — a day, a time and how many animals of each kind —
 * or shares of an animal (hissa), with the names for each share.
 *
 *   pending → confirmed → completed
 *           ↘ declined   ↘ cancelled (either side, with a reason)
 *   pending past its day → expired
 *
 * The ad's name and link are copied in, so the booking still reads right
 * if the ad is edited or removed.
 */
import mongoose, { Schema, type Document } from "mongoose";

export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "expired";

export interface IBooking extends Document {
  code: string;
  kind: "service" | "share";
  listingId: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  listingName: string;
  listingSlug: string;
  status: BookingStatus;
  day: string;
  dayDate: Date | null;
  dayLabel: string;
  slot: string | null;
  slotLabel: string | null;
  units: { key: string; label: string; count: number; rate: number | null }[];
  totalUnits: number;
  shares: number;
  names: string[];
  estimate: number | null;
  contactName: string;
  phone: string;
  city: string | null;
  area: string | null;
  address: string | null;
  note: string | null;
  providerNote: string | null;
  reason: string | null;
  cancelledBy: "customer" | "provider" | "admin" | "system" | null;
  confirmedAt: Date | null;
  closedAt: Date | null;
  remindedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    code: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["service", "share"], required: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    providerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    listingName: { type: String, required: true },
    listingSlug: { type: String, default: "" },
    status: { type: String, enum: ["pending", "confirmed", "declined", "cancelled", "completed", "expired"], default: "pending" },
    day: { type: String, required: true },
    dayDate: { type: Date, default: null },
    dayLabel: { type: String, default: "" },
    slot: { type: String, default: null },
    slotLabel: { type: String, default: null },
    units: [{ _id: false, key: String, label: String, count: Number, rate: { type: Number, default: null } }],
    totalUnits: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    names: { type: [String], default: [] },
    estimate: { type: Number, default: null },
    contactName: { type: String, required: true, maxlength: 80 },
    phone: { type: String, required: true },
    city: { type: String, default: null },
    area: { type: String, default: null },
    address: { type: String, default: null, maxlength: 300 },
    note: { type: String, default: null, maxlength: 500 },
    providerNote: { type: String, default: null, maxlength: 300 },
    reason: { type: String, default: null, maxlength: 300 },
    cancelledBy: { type: String, enum: ["customer", "provider", "admin", "system", null], default: null },
    confirmedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    remindedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

BookingSchema.index({ providerId: 1, status: 1, dayDate: 1 });
BookingSchema.index({ customerId: 1, createdAt: -1 });
BookingSchema.index({ listingId: 1, status: 1, day: 1 });
BookingSchema.index({ status: 1, dayDate: 1 });

export default (mongoose.models.Booking as mongoose.Model<IBooking>) || mongoose.model<IBooking>("Booking", BookingSchema);
