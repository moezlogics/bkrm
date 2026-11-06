/**
 * Whether this site takes bookings (qasai, hissa…): set by the vertical's
 * `bookings` config. Off on cars and bikes, so none of it shows there.
 */
import { VERTICAL } from "@/vertical";

export const BOOKINGS_ON = !!VERTICAL.bookings;
