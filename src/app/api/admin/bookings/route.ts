import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import Booking from "@/models/Booking";
import User from "@/models/User";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { updateBooking, BookingError } from "@/lib/bookings/server";
import { logAdmin } from "@/lib/admin-log";

/**
 * GET   /api/admin/bookings?status=&kind=&q=&page=   every booking, with counts
 * PATCH /api/admin/bookings { id, reason }            cancel one (both sides are told)
 */
export async function GET(req: NextRequest) {
  if (!BOOKINGS_ON) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  const { error } = await requireAdmin();
  if (error) return error;
  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const q: Record<string, unknown> = {};
  const status = sp.get("status") || "";
  if (status === "open") q.status = { $in: ["pending", "confirmed"] };
  else if (status) q.status = status;
  if (sp.get("kind") === "service" || sp.get("kind") === "share") q.kind = sp.get("kind");
  const term = (sp.get("q") || "").trim().slice(0, 60);
  if (term) {
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ code: rx }, { listingName: rx }, { contactName: rx }, { phone: rx }];
  }
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [rows, total, byStatus, byDay] = await Promise.all([
    Booking.find(q).sort({ createdAt: -1 }).skip((page - 1) * 30).limit(30)
      .populate({ path: "providerId", model: User, select: "name" })
      .populate({ path: "customerId", model: User, select: "name" }).lean(),
    Booking.countDocuments(q),
    Booking.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Booking.aggregate([
      { $match: { status: { $in: ["pending", "confirmed"] } } },
      { $group: { _id: "$dayLabel", bookings: { $sum: 1 }, units: { $sum: "$totalUnits" } } },
      { $sort: { _id: 1 } }, { $limit: 10 },
    ]),
  ]);
  const counts: Record<string, number> = {};
  for (const r of byStatus as any[]) counts[r._id] = r.n;
  return NextResponse.json({
    success: true, total, pages: Math.max(1, Math.ceil(total / 30)), counts, byDay,
    data: (rows as any[]).map((b) => ({
      _id: String(b._id), code: b.code, kind: b.kind, status: b.status, listingName: b.listingName, listingSlug: b.listingSlug,
      dayLabel: b.dayLabel, slotLabel: b.slotLabel, units: b.units, shares: b.shares, estimate: b.estimate,
      contactName: b.contactName, phone: b.phone, area: b.area, address: b.address,
      provider: b.providerId ? { id: String(b.providerId._id), name: b.providerId.name } : null,
      customer: b.customerId ? { id: String(b.customerId._id), name: b.customerId.name } : null,
      reason: b.reason, cancelledBy: b.cancelledBy, createdAt: b.createdAt,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: NextRequest) {
  if (!BOOKINGS_ON) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  const { session, error } = await requireAdmin();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || "").trim().slice(0, 300);
  if (!reason) return NextResponse.json({ success: false, message: "Write why — both sides see it" }, { status: 400 });
  try {
    const b = await updateBooking(String(body?.id || ""), { userId: "admin", role: "admin" }, "cancel", reason);
    await logAdmin(session, { action: "booking.cancel", targetType: "booking", targetId: b._id, targetLabel: b.code, details: `${b.listingName} — ${reason}` });
    return NextResponse.json({ success: true, message: "Cancelled — both sides have been told." });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ success: false, message: e.message }, { status: e.status });
    throw e;
  }
}
