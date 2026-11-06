import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getServerSession } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { BOOKINGS } from "@/lib/bookings/shared";
import { bookableAd, availability, serviceUnits } from "@/lib/bookings/server";
import { trustKind } from "@/lib/trust";
import { BookingForm } from "./BookingForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book", robots: { index: false, follow: false } };

/**
 * Book an ad: a qasai's (or other provider's) day and time, or shares of an
 * animal. Signed-out visitors can fill it in; sending asks them to sign in.
 */
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!BOOKINGS_ON) notFound();
  const { slug } = await params;
  const b = await bookableAd(slug);
  if (!b || b.listing.status !== "approved") notFound();
  const session = await getServerSession();
  const [a, me] = await Promise.all([
    availability(b),
    session?.userId ? (dbConnect().then(() => User.findById(session.userId).select("name phoneNumber area city").lean()) as Promise<any>) : Promise.resolve(null),
  ]);
  const l = b.listing;
  const provider = l.userId || {};
  const isService = b.kind === "service";
  const cfg = isService ? BOOKINGS!.service! : BOOKINGS!.share!;

  return (
    <BookingForm
      kind={b.kind}
      title={cfg.title}
      note={cfg.note || ""}
      ad={{
        id: String(l._id), slug: l.slug, name: l.name, price: l.price ?? null, image: l.mainImage || l.galleryImages?.[0] || null,
        place: [l.area, l.city].filter(Boolean).join(", "),
        provider: { name: provider.name || "Provider", verified: !!trustKind(provider) },
      }}
      days={b.days.map((d) => ({ ...d, left: a.kind === "service" ? a.perDay[d.key]?.left ?? null : null, capacity: a.kind === "service" ? a.perDay[d.key]?.capacity ?? null : null }))}
      eventDate={b.eventDate}
      slots={isService ? BOOKINGS!.service!.slots : []}
      units={isService ? serviceUnits(b) : []}
      shares={a.kind === "share" ? { available: a.available, total: a.total, max: BOOKINGS!.share!.maxPerBooking, namesLabel: BOOKINGS!.share!.namesLabel } : null}
      me={session?.userId ? { signedIn: true, isOwner: String(provider._id) === session.userId, name: me?.name || "", phone: me?.phoneNumber || "", area: me?.area || "" } : { signedIn: false, isOwner: false, name: "", phone: "", area: "" }}
    />
  );
}
