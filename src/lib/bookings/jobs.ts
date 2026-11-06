/**
 * Booking upkeep (lib/jobs, every 10 minutes, only where bookings are on):
 *   - the evening before a confirmed booking's day (from 4 pm Pakistan time),
 *     a reminder to the customer and the provider, once;
 *   - a request still unanswered when its day has gone is closed as
 *     "not answered in time", and the customer is told so they can book
 *     someone else (shares held by it free up by themselves).
 */
import dbConnect from "@/lib/mongodb";
import Booking from "@/models/Booking";
import User from "@/models/User";
import { pushToUsers } from "@/lib/push/notify";
import { todayPk, addDays } from "@/lib/bookings/shared";
import { bookingWhat } from "@/lib/bookings/server";

const pkHour = () => new Date(Date.now() + 5 * 3_600_000).getUTCHours();

export async function runBookingJobs(): Promise<void> {
  await dbConnect();
  const today = todayPk();

  if (pkHour() >= 16) {
    const tomorrow = new Date(`${addDays(today, 1)}T00:00:00Z`);
    const due: any[] = await Booking.find({ status: "confirmed", dayDate: tomorrow, remindedAt: null }).limit(500).lean();
    for (const b of due) {
      const claimed = await Booking.updateOne({ _id: b._id, remindedAt: null }, { $set: { remindedAt: new Date() } });
      if (!claimed.modifiedCount) continue;
      const [p, c]: any[] = await Promise.all([User.findById(b.providerId).select("name").lean(), User.findById(b.customerId).select("name").lean()]);
      const what = bookingWhat(b);
      const when = `${b.dayLabel}${b.slotLabel ? `, ${b.slotLabel.toLowerCase()}` : ""}`;
      await pushToUsers([b.customerId], { type: "booking_reminder", vars: { what, when, other: p?.name || "the provider" }, url: `/dashboard/bookings?b=${b.code}`, tag: `booking:${b.code}` });
      await pushToUsers([b.providerId], { type: "booking_reminder", vars: { what, when, other: c?.name || b.contactName }, url: `/dashboard/bookings?tab=received&b=${b.code}`, tag: `booking:${b.code}` });
    }
  }

  const stale: any[] = await Booking.find({ status: "pending", dayDate: { $lt: new Date(`${today}T00:00:00Z`) } }).limit(500).lean();
  for (const b of stale) {
    const r = await Booking.updateOne({ _id: b._id, status: "pending" }, { $set: { status: "expired", closedAt: new Date(), cancelledBy: "system", reason: "No answer before the day" } });
    if (!r.modifiedCount) continue;
    const p: any = await User.findById(b.providerId).select("name").lean();
    await pushToUsers([b.customerId], {
      type: "booking_declined",
      vars: { provider: p?.name || "The provider", what: bookingWhat(b), reason: "They didn't reply in time." },
      url: `/ads/${b.listingSlug}`, tag: `booking:${b.code}`,
    });
  }
}
