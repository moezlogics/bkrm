/**
 * Booking helpers safe for the server and the browser: which sections can be
 * booked, the days on offer with their dates (from the event date), and the
 * price estimate. Pakistan time throughout.
 */
import { VERTICAL } from "@/vertical";
import type { BookingConfig, BookingDay } from "@/vertical/types";

export type BookingKind = "service" | "share";
export const BOOKINGS: BookingConfig | undefined = VERTICAL.bookings;

/** Which kind of booking an ad in this top section takes, if any. */
export function bookingKindForTop(topSlug?: string | null): BookingKind | null {
  if (!BOOKINGS || !topSlug) return null;
  if (BOOKINGS.service?.tops.includes(topSlug)) return "service";
  if (BOOKINGS.share?.tops.includes(topSlug)) return "share";
  return null;
}

const PK_OFFSET = 5 * 3_600_000;
/** Today in Pakistan, YYYY-MM-DD. */
export const todayPk = (now = Date.now()) => new Date(now + PK_OFFSET).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
/** "Sun 16 May" */
export const shortDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export type DayOption = { key: string; label: string; date: string | null; pickDate: boolean; past: boolean };

/**
 * The days a booking can be for. `offered` = the labels the ad lists (e.g.
 * its "Available" field); empty means every configured day. Days already
 * over are marked `past` (shown, not bookable).
 */
export function dayOptions(days: BookingDay[], eventDate: string | null, offered: string[] = []): DayOption[] {
  const want = new Set(offered.map((s) => s.toLowerCase().trim()).filter(Boolean));
  const today = todayPk();
  return days
    .filter((d) => !want.size || want.has(d.label.toLowerCase()))
    .map((d) => {
      const date = d.pickDate ? null : eventDate && isYmd(eventDate) ? addDays(eventDate, d.offset || 0) : null;
      const past = d.pickDate ? !!eventDate && eventDate <= today : !!date && date < today;
      return { key: d.key, label: d.label, date, pickDate: !!d.pickDate, past };
    });
}

/** "Eid day 1 · Sun 16 May" (or the chosen date for a pick-a-date day). */
export function dayText(opt: { label: string; date: string | null }, picked?: string | null) {
  const date = picked || opt.date;
  return date ? `${opt.label} · ${shortDate(date)}` : opt.label;
}

/** Sum of count × rate for the units with a rate; null when none has one. */
export function estimate(units: { count: number; rate: number | null }[]): number | null {
  let total = 0, priced = false;
  for (const u of units) if (u.count > 0 && u.rate) { total += u.count * u.rate; priced = true; }
  return priced ? total : null;
}

export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
export const asNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting for confirmation",
  confirmed: "Confirmed",
  declined: "Not accepted",
  cancelled: "Cancelled",
  completed: "Done",
  expired: "Not answered in time",
};
