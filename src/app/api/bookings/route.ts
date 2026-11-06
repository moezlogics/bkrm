import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAuth } from "@/lib/auth";
import Booking from "@/models/Booking";
import Listing from "@/models/Listing";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { createBooking, BookingError } from "@/lib/bookings/server";

const off = () => NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
const noStore = { "Cache-Control": "private, no-store" };

/**
 * GET  /api/bookings?as=customer|provider&status=open|closed|all
 *      my bookings (made by me, or for my ads), soonest day first for open ones
 * POST /api/bookings { listingId, day, date?, slot?, units?, shares?, names?, contactName, phone, area?, address?, note? }
 */
export async function GET(req: NextRequest) {
  if (!BOOKINGS_ON) return off();
  const { session, error } = await requireAuth();
  if (error) return error;
  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.userId);
  const as = req.nextUrl.searchParams.get("as") === "provider" ? "provider" : "customer";
  const status = req.nextUrl.searchParams.get("status") || "open";
  const q: Record<string, unknown> = as === "provider" ? { providerId: uid } : { customerId: uid };
  if (status === "open") q.status = { $in: ["pending", "confirmed"] };
  else if (status === "closed") q.status = { $in: ["declined", "cancelled", "completed", "expired"] };

  const [rows, counts, bookableAds] = await Promise.all([
    Booking.find(q).sort(status === "open" ? { dayDate: 1, createdAt: 1 } : { updatedAt: -1 }).limit(200)
      .populate({ path: as === "provider" ? "customerId" : "providerId", select: "name phoneNumber profileImage" })
      .lean(),
    Booking.aggregate([
      { $match: as === "provider" ? { providerId: uid } : { customerId: uid } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    // Whether this person has anything that can be booked (shows the "For my ads" tab).
    as === "customer" ? Booking.exists({ providerId: uid }).then(async (x) => !!x || !!(await Listing.exists({ userId: uid, status: "approved" }))) : Promise.resolve(true),
  ]);
  const c: Record<string, number> = {};
  for (const r of counts as any[]) c[r._id] = r.n;

  return NextResponse.json({
    success: true,
    counts: c,
    hasProviderSide: bookableAds,
    data: (rows as any[]).map((b) => {
      const other = as === "provider" ? b.customerId : b.providerId;
      return {
        _id: String(b._id), code: b.code, kind: b.kind, status: b.status,
        listing: { id: String(b.listingId), name: b.listingName, slug: b.listingSlug },
        day: b.day, dayDate: b.dayDate, dayLabel: b.dayLabel, slotLabel: b.slotLabel,
        units: b.units, totalUnits: b.totalUnits, shares: b.shares, names: b.names, estimate: b.estimate,
        contactName: b.contactName, area: b.area, address: b.address, note: b.note,
        // The customer's number goes to the provider; the provider's is on their ad.
        phone: as === "provider" ? b.phone : b.status === "confirmed" || b.status === "completed" ? other?.phoneNumber || null : null,
        other: other ? { id: String(other._id), name: other.name, image: other.profileImage || null } : null,
        providerNote: b.providerNote, reason: b.reason, cancelledBy: b.cancelledBy,
        createdAt: b.createdAt, confirmedAt: b.confirmedAt,
      };
    }),
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!BOOKINGS_ON) return off();
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  try {
    const b = await createBooking(session.userId, body);
    return NextResponse.json({ success: true, message: "Booking sent — you'll get a notification when it's confirmed.", data: { code: b.code, id: String(b._id) } });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("[bookings] create failed:", e);
    return NextResponse.json({ success: false, message: "Something went wrong — please try again" }, { status: 500 });
  }
}
