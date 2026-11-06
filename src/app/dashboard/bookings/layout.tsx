import { notFound } from "next/navigation";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";

export const metadata = { title: "Bookings", robots: { index: false, follow: false } };

/** Only on sites that take bookings (see the vertical's `bookings`). */
export default function BookingsLayout({ children }: { children: React.ReactNode }) {
  if (!BOOKINGS_ON) notFound();
  return children;
}
