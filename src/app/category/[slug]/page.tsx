import { permanentRedirect, notFound } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/Category";

/**
 * Legacy category URL → 308 redirect to the canonical nested path
 * (e.g. /category/cars → /vehicles/cars). Keeps old links + SEO intact.
 */
export default async function CategoryRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await dbConnect();
  const cat = await Category.findOne({ slug, status: true }).select("path slug").lean();
  if (!cat) notFound();
  permanentRedirect(`/${(cat as any).path || (cat as any).slug}`);
}
