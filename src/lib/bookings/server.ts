/**
 * Bookings (server): what can be booked on an ad, what's still free, and the
 * booking's life — request, confirm, decline, cancel, done — with a
 * notification to the other side at every step.
 *
 *  - service (qasai…): a day (+ a time), how many animals of each kind and an
 *    address. A day stops taking requests when pending + confirmed bookings
 *    reach the ad's "per day" number.
 *  - share (hissa): N shares and the names for them. Pending requests hold
 *    their shares, so two people can't book the last one; confirming takes
 *    them off the ad's "shares left", cancelling a confirmed one puts them back.
 */
import mongoose from "mongoose";
import { randomBytes } from "crypto";
import dbConnect from "@/lib/mongodb";
import Booking, { type IBooking } from "@/models/Booking";
import Listing from "@/models/Listing";
import Category from "@/models/Category";
import Setting from "@/models/Setting";
import User from "@/models/User";
import { VERTICAL } from "@/vertical";
import { pushToUsers } from "@/lib/push/notify";
import { sendEmailQuietly, siteUrl } from "@/lib/email";
import { normalizePkMobile } from "@/lib/phone";
import {
  BOOKINGS, bookingKindForTop, dayOptions, dayText, estimate, asList, asNum, todayPk, addDays, isYmd,
  type BookingKind, type DayOption,
} from "@/lib/bookings/shared";

export class BookingError extends Error {
  constructor(message: string, public field?: string, public status = 400) { super(message); }
}

export async function getEventDate(): Promise<string | null> {
  await dbConnect();
  const s: any = await Setting.findOne({ key: "event_date" }).select("value").lean();
  const v = String(s?.value || VERTICAL.event?.date || "").trim();
  return isYmd(v) ? v : null;
}

export type Bookable = {
  listing: any;
  kind: BookingKind;
  specs: Record<string, any>;
  days: DayOption[];
  eventDate: string | null;
};

const specsOf = (l: any): Record<string, any> => {
  const v = l?.customFieldValues;
  if (!v) return {};
  return v instanceof Map ? Object.fromEntries(v) : { ...v };
};

/** The ad, if it can be booked (live, in a bookable section). */
export async function bookableAd(idOrSlug: string): Promise<Bookable | null> {
  if (!BOOKINGS) return null;
  await dbConnect();
  const q = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const listing: any = await Listing.findOne(q)
    .select("name slug status userId price priceType city area mainImage galleryImages customFieldValues allCategoryIds categoryId isDemo")
    .populate({ path: "userId", model: User, select: "name phoneNumber email profileImage verificationLevel verificationStatus isSeller isBlocked" })
    .lean();
  if (!listing) return null;
  const top: any = await Category.findOne({ _id: { $in: listing.allCategoryIds || [] }, parentCategoryId: null }).select("slug").lean();
  const kind = bookingKindForTop(top?.slug);
  if (!kind) return null;
  const specs = specsOf(listing);
  const eventDate = await getEventDate();
  const days = kind === "service"
    ? dayOptions(BOOKINGS.service!.days, eventDate, BOOKINGS.service!.daysField ? asList(specs[BOOKINGS.service!.daysField]) : [])
    : dayOptions(BOOKINGS.share!.days, eventDate, BOOKINGS.share!.dayField ? asList(specs[BOOKINGS.share!.dayField]) : []);
  return { listing, kind, specs, days, eventDate };
}

/** The units this provider takes, with their rate (a unit with a rate field but no rate isn't offered). */
export function serviceUnits(b: Bookable) {
  const units = BOOKINGS?.service?.units || [];
  const withRates = units.filter((u) => u.rateField && asNum(b.specs[u.rateField]));
  // No rates filled in at all: every unit, priced on confirmation.
  const list = withRates.length ? withRates : units;
  return list.map((u) => ({ key: u.key, label: u.label, rate: u.rateField ? asNum(b.specs[u.rateField]) : null }));
}

const OPEN = ["pending", "confirmed"];

/** Service: per day, what's taken and what's left. Share: shares left once pending requests are held. */
export async function availability(b: Bookable) {
  await dbConnect();
  if (b.kind === "service") {
    const cap = BOOKINGS?.service?.capacityField ? asNum(b.specs[BOOKINGS.service.capacityField]) : null;
    const rows: any[] = await Booking.aggregate([
      { $match: { listingId: new mongoose.Types.ObjectId(String(b.listing._id)), status: { $in: OPEN } } },
      { $group: { _id: { day: "$day", date: "$dayDate" }, units: { $sum: "$totalUnits" } } },
    ]);
    const perDay: Record<string, { capacity: number | null; booked: number; left: number | null }> = {};
    for (const d of b.days) {
      const booked = rows.filter((r) => r._id.day === d.key).reduce((a, r) => a + r.units, 0);
      perDay[d.key] = { capacity: d.pickDate ? null : cap, booked, left: d.pickDate || cap == null ? null : Math.max(0, cap - booked) };
    }
    return { kind: "service" as const, capacity: cap, perDay };
  }
  const cfg = BOOKINGS!.share!;
  const total = asNum(b.specs[cfg.totalField]) || 7;
  const left = Math.max(0, Math.floor(Number(b.specs[cfg.leftField]) || 0));
  const held: any[] = await Booking.aggregate([
    { $match: { listingId: new mongoose.Types.ObjectId(String(b.listing._id)), status: "pending" } },
    { $group: { _id: null, n: { $sum: "$shares" } } },
  ]);
  const pending = held[0]?.n || 0;
  return { kind: "share" as const, total, left, pending, available: Math.max(0, left - pending) };
}

/** The ad page's booking box: the button and one line of what's free. */
export async function bookingSummary(slug: string) {
  const b = await bookableAd(slug);
  if (!b || b.listing.status !== "approved") return null;
  const a = await availability(b);
  const cfg = b.kind === "service" ? BOOKINGS!.service! : BOOKINGS!.share!;
  let lines: string[] = [];
  let full = false;
  if (a.kind === "service") {
    const open = b.days.filter((d) => !d.past);
    full = open.length > 0 && open.every((d) => a.perDay[d.key]?.left === 0);
    lines = open.map((d) => {
      const p = a.perDay[d.key];
      return p?.left == null ? `${d.label}: open` : p.left === 0 ? `${d.label}: full` : `${d.label}: ${p.left} of ${p.capacity} left`;
    });
    if (!open.length) { full = true; lines = ["No days left to book this year"]; }
  } else {
    full = a.available <= 0;
    lines = [full ? (a.pending ? "All shares are booked or on hold" : "All shares are booked") : `${a.available} of ${a.total} shares free`];
  }
  return { kind: b.kind, cta: cfg.cta, title: cfg.title, href: `/ads/${b.listing.slug}/book`, lines, full };
}

const code = () => `BK-${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 × Bakra / Dumba, 1 × Gaye" or "3 hissay" — for notifications. */
export function bookingWhat(b: Pick<IBooking, "kind" | "units" | "shares">) {
  if (b.kind === "share") return b.shares === 1 ? "1 hissa" : `${b.shares} hissay`;
  return b.units.filter((u) => u.count > 0).map((u) => `${u.count} × ${u.label}`).join(", ") || "a booking";
}

// Per-person burst limit for new bookings (per process).
const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter((t) => now - t < 3_600_000);
  if (list.length >= 10) return false;
  list.push(now);
  recent.set(userId, list);
  return true;
}

export async function createBooking(customerId: string, body: any) {
  const adId = String(body?.listingId || "");
  if (!mongoose.isValidObjectId(adId)) throw new BookingError("This ad can't be booked", undefined, 404);
  const b = await bookableAd(adId);
  if (!b || b.listing.status !== "approved") throw new BookingError("This ad can't be booked right now", undefined, 404);
  const provider = b.listing.userId;
  if (!provider || provider.isBlocked) throw new BookingError("This ad can't be booked right now", undefined, 404);
  if (String(provider._id) === customerId) throw new BookingError("You can't book your own ad");
  if (!allow(customerId)) throw new BookingError("Too many bookings in a short time — please wait a little", undefined, 429);

  const contactName = clean(body.contactName, 80);
  if (contactName.length < 2) throw new BookingError("Please write your name", "contactName");
  const phone = normalizePkMobile(body.phone);
  if (!phone) throw new BookingError("Please enter your mobile number, e.g. 03001234567", "phone");
  const address = clean(body.address, 300) || null;
  const area = clean(body.area, 80) || null;
  const note = clean(body.note, 500) || null;

  await dbConnect();
  const custOid = new mongoose.Types.ObjectId(customerId);
  const already = await Booking.countDocuments({ listingId: b.listing._id, customerId: custOid, status: "pending" });
  if (already >= 3) throw new BookingError("You already have bookings waiting on this ad — wait for the reply or cancel one");

  const doc: Partial<IBooking> & Record<string, unknown> = {
    code: code(), kind: b.kind, listingId: b.listing._id, providerId: provider._id, customerId: custOid,
    listingName: b.listing.name, listingSlug: b.listing.slug,
    contactName, phone, address, area, note, city: b.listing.city || null,
  };

  if (b.kind === "service") {
    const cfg = BOOKINGS!.service!;
    const day = b.days.find((d) => d.key === body.day);
    if (!day || day.past) throw new BookingError("Please choose one of the days on offer", "day");
    let date = day.date;
    if (day.pickDate) {
      const picked = String(body.date || "");
      const today = todayPk();
      const last = b.eventDate ? addDays(b.eventDate, -1) : null;
      if (!isYmd(picked) || picked < today || (last && picked > last)) throw new BookingError(last ? "Choose a date from today until the day before Eid" : "Choose a date", "date");
      date = picked;
    }
    const slot = body.slot ? cfg.slots.find((s) => s.key === body.slot) : null;
    if (body.slot && !slot) throw new BookingError("Please choose a time", "slot");
    const offered = serviceUnits(b);
    const units = offered.map((u) => ({ key: u.key, label: u.label, rate: u.rate, count: Math.max(0, Math.min(50, Math.floor(Number(body.units?.[u.key]) || 0))) }));
    const total = units.reduce((a, u) => a + u.count, 0);
    if (!total) throw new BookingError("How many animals? Add at least one", "units");
    if (!address || address.length < 5) throw new BookingError("Please write the address where the work is", "address");

    const a = await availability(b);
    const left = a.kind === "service" ? a.perDay[day.key]?.left : null;
    if (left != null && total > left) {
      throw new BookingError(left === 0 ? `${day.label} is fully booked — please choose another day` : `Only ${plural(left, "animal")} can still be booked for ${day.label}`, "units");
    }
    Object.assign(doc, {
      day: day.key, dayDate: date ? new Date(`${date}T00:00:00Z`) : null, dayLabel: dayText(day, date),
      slot: slot?.key || null, slotLabel: slot?.label || null,
      units: units.filter((u) => u.count > 0), totalUnits: total, estimate: estimate(units),
    });
  } else {
    const cfg = BOOKINGS!.share!;
    const shares = Math.floor(Number(body.shares) || 0);
    if (shares < 1 || shares > cfg.maxPerBooking) throw new BookingError(`Choose 1 to ${cfg.maxPerBooking} shares`, "shares");
    const a = await availability(b);
    if (a.kind === "share" && shares > a.available) {
      throw new BookingError(a.available ? `Only ${plural(a.available, "share")} ${a.available === 1 ? "is" : "are"} free` : "All shares are booked", "shares");
    }
    const names = Array.from({ length: shares }, (_, i) => clean(Array.isArray(body.names) ? body.names[i] : "", 60));
    if (names.some((n) => n.length < 2)) {
      throw new BookingError(shares === 1 ? "Please write the name for the hissa" : "Please write a name for each hissa", "names");
    }
    const day = b.days[0] || { key: "eid1", label: "Eid day 1", date: null, pickDate: false, past: false };
    const price = Number(b.listing.price) || 0;
    Object.assign(doc, {
      day: day.key, dayDate: day.date ? new Date(`${day.date}T00:00:00Z`) : null, dayLabel: dayText(day),
      shares, names, totalUnits: shares, estimate: price ? price * shares : null,
    });
  }

  const booking = await Booking.create(doc);
  const customer: any = await User.findById(custOid).select("name").lean();
  const what = bookingWhat(booking);
  void pushToUsers([provider._id], {
    type: "booking_request",
    vars: { customer: customer?.name || contactName, what, when: booking.dayLabel, listing: b.listing.name },
    url: `/dashboard/bookings?tab=received&b=${booking.code}`, tag: `booking:${booking.code}`,
  }).catch(() => { });
  sendEmailQuietly(provider.email, {
    subject: `New booking ${booking.code}: ${what}`,
    preheader: `${customer?.name || contactName} wants ${what} on ${booking.dayLabel}.`,
    heading: "You have a new booking request",
    paragraphs: [
      `${customer?.name || contactName} booked ${what} on ${booking.dayLabel}${booking.slotLabel ? `, ${booking.slotLabel.toLowerCase()}` : ""} through your ad “${b.listing.name}”.`,
      "Confirm it or decline it from your bookings — the customer is waiting for your answer.",
    ],
    button: { label: "Open my bookings", url: siteUrl(`/dashboard/bookings?tab=received&b=${booking.code}`) },
  });
  return booking;
}

type Actor = { userId: string; role?: string };
export type BookingAction = "confirm" | "decline" | "cancel" | "complete";

export async function updateBooking(id: string, actor: Actor, action: BookingAction, text?: string) {
  if (!mongoose.isValidObjectId(id)) throw new BookingError("Booking not found", undefined, 404);
  await dbConnect();
  const bk = await Booking.findById(id);
  if (!bk) throw new BookingError("Booking not found", undefined, 404);
  const isProvider = String(bk.providerId) === actor.userId;
  const isCustomer = String(bk.customerId) === actor.userId;
  const isAdmin = actor.role === "admin";
  if (!isProvider && !isCustomer && !isAdmin) throw new BookingError("Booking not found", undefined, 404);
  const note = clean(text, 300) || null;
  const was = bk.status;

  if (action === "confirm") {
    if (!isProvider) throw new BookingError("Only the provider can confirm", undefined, 403);
    if (was !== "pending") throw new BookingError("This booking isn't waiting for an answer any more");
    if (bk.kind === "share") {
      const field = `customFieldValues.${BOOKINGS?.share?.leftField || "shares_left"}`;
      const r = await Listing.updateOne({ _id: bk.listingId, [field]: { $gte: bk.shares } }, { $inc: { [field]: -bk.shares } });
      if (!r.modifiedCount) throw new BookingError("Not enough shares left on the ad — update “Shares left” or decline this booking");
    }
    bk.status = "confirmed"; bk.confirmedAt = new Date(); bk.providerNote = note;
  } else if (action === "decline") {
    if (!isProvider) throw new BookingError("Only the provider can decline", undefined, 403);
    if (was !== "pending") throw new BookingError("This booking isn't waiting for an answer any more");
    bk.status = "declined"; bk.reason = note; bk.closedAt = new Date();
  } else if (action === "cancel") {
    if (!["pending", "confirmed"].includes(was)) throw new BookingError("This booking is already closed");
    if (isCustomer && !isAdmin && was === "confirmed" && bk.dayDate && bk.dayDate.toISOString().slice(0, 10) < todayPk()) {
      throw new BookingError("This booking's day has passed");
    }
    if (bk.kind === "share" && was === "confirmed") {
      const field = `customFieldValues.${BOOKINGS?.share?.leftField || "shares_left"}`;
      await Listing.updateOne({ _id: bk.listingId }, { $inc: { [field]: bk.shares } });
    }
    bk.status = "cancelled"; bk.reason = note; bk.closedAt = new Date();
    bk.cancelledBy = isAdmin && !isCustomer && !isProvider ? "admin" : isCustomer ? "customer" : "provider";
  } else if (action === "complete") {
    if (!isProvider && !isAdmin) throw new BookingError("Only the provider can mark it done", undefined, 403);
    if (was !== "confirmed") throw new BookingError("Only a confirmed booking can be marked done");
    bk.status = "completed"; bk.closedAt = new Date();
  } else {
    throw new BookingError("Unknown action");
  }
  await bk.save();
  void tell(bk, action).catch(() => { });
  return bk;
}

/** The other side hears about each step. */
async function tell(bk: IBooking, action: BookingAction) {
  const [provider, customer]: any[] = await Promise.all([
    User.findById(bk.providerId).select("name email").lean(),
    User.findById(bk.customerId).select("name email").lean(),
  ]);
  const what = bookingWhat(bk);
  const toCustomer = `/dashboard/bookings?b=${bk.code}`;
  const toProvider = `/dashboard/bookings?tab=received&b=${bk.code}`;
  const tag = `booking:${bk.code}`;
  if (action === "confirm") {
    await pushToUsers([bk.customerId], { type: "booking_confirmed", vars: { provider: provider?.name || "The provider", what, when: bk.dayLabel, code: bk.code }, url: toCustomer, tag });
    sendEmailQuietly(customer?.email, {
      subject: `Booking ${bk.code} confirmed`,
      preheader: `${provider?.name || "The provider"} confirmed ${what} on ${bk.dayLabel}.`,
      heading: "Your booking is confirmed ✓",
      paragraphs: [
        `${provider?.name || "The provider"} confirmed ${what} on ${bk.dayLabel}${bk.slotLabel ? `, ${bk.slotLabel.toLowerCase()}` : ""} — “${bk.listingName}”.`,
        ...(bk.providerNote ? [`Their note: ${bk.providerNote}`] : []),
        "Pay them directly, in person. Never send an advance to someone you haven't met.",
      ],
      button: { label: "See the booking", url: siteUrl(toCustomer) },
    });
  } else if (action === "decline") {
    await pushToUsers([bk.customerId], { type: "booking_declined", vars: { provider: provider?.name || "The provider", what, reason: bk.reason ? `“${bk.reason}”` : "" }, url: `/ads/${bk.listingSlug}`, tag });
  } else if (action === "cancel") {
    const by = bk.cancelledBy === "customer" ? customer?.name || "The customer" : bk.cancelledBy === "provider" ? provider?.name || "The provider" : "Our team";
    const to = bk.cancelledBy === "customer" ? [bk.providerId] : bk.cancelledBy === "provider" ? [bk.customerId] : [bk.providerId, bk.customerId];
    await pushToUsers(to, { type: "booking_cancelled", vars: { by, what, when: bk.dayLabel, reason: bk.reason ? `Reason: ${bk.reason}` : "" }, url: bk.cancelledBy === "customer" ? toProvider : toCustomer, tag });
  }
}
