import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import { getCatalog } from "@/lib/catalog";
import { TtlLru } from "@/lib/memo";

/**
 * A cover photo for each top section (the tiles on the home page and in the
 * menu): the main photo of that section's most popular live ad — featured
 * first, then most viewed. Real photos from the site's own media, never stock.
 * Built once every 10 minutes and shared.
 */
const cache = new TtlLru<Record<string, string>>(1, 10 * 60_000);

export function getSectionCovers(): Promise<Record<string, string>> {
  return cache.memo("covers", async () => {
    await dbConnect();
    const catalog = await getCatalog();
    const tops = catalog.topCategories();
    const rows = await Promise.all(tops.map(async (c) => {
      const ad = await Listing.findOne({ status: "approved", allCategoryIds: String(c._id), mainImage: { $nin: [null, ""] } })
        .sort({ isFeatured: -1, clicks: -1 }).select("mainImage").maxTimeMS(3000).lean<{ mainImage?: string }>();
      return [c.slug, ad?.mainImage || ""] as const;
    }));
    return Object.fromEntries(rows.filter(([, img]) => img));
  }).catch(() => ({}));
}
