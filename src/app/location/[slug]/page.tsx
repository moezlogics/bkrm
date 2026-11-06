import { permanentRedirect, notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import City from "@/models/City";

/**
 * Legacy location URL → 308 redirect to the canonical city hub
 * (e.g. /location/multan → /multan).
 */
export default async function LocationRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await dbConnect();
  const city = await City.findOne({ slug: slug.toLowerCase(), isActive: true }).select("slug").lean();
  if (!city) notFound();
  permanentRedirect(`/${(city as any).slug}`);
}
