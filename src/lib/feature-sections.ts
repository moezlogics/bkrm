/**
 * Resolves admin-configured homepage FeatureSections into listing rails.
 *
 * All rails are fetched in parallel (they used to be resolved one after
 * another — section, then its category, then its listings — which made this
 * the slowest part of the homepage), and only the lean card shape crosses
 * the wire rather than whole listing documents.
 */
import dbConnect from "@/lib/mongodb";
import FeatureSection from "@/models/FeatureSection";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { getCatalog } from "@/lib/catalog";
import { CARD_SELECT, CARD_SELLER_SELECT, toCards } from "@/lib/listing-card";

/** Loader — use the cached `getHomepageSections` from lib/home-content. */
export async function loadHomepageSections() {
  try {
    await dbConnect();
    const [sections, catalog] = await Promise.all([
      FeatureSection.find({}).sort({ sequence: 1 }).limit(8).lean(),
      getCatalog(),
    ]);
    if (!sections.length) return [];

    const rails = await Promise.all(
      (sections as any[]).map(async (s) => {
        const query: Record<string, any> = { status: "approved" };
        if (s.filter === "featured") query.isFeatured = true;
        else if (s.filter === "category" && s.value) {
          const cat = catalog.categories.find((c) => c.slug === s.value);
          if (cat) query.allCategoryIds = String(cat._id);
        } else if (s.filter === "city" && s.value) {
          // Indexed city reference, not a case-insensitive regex over every ad.
          const v = String(s.value).trim().toLowerCase();
          const city = catalog.city(v) || catalog.cities.find((c) => c.name.toLowerCase() === v);
          if (!city) return null;
          query["locationRefs.cityId"] = city._id;
        }
        if (s.minPrice != null || s.maxPrice != null) {
          query.price = {};
          if (s.minPrice != null) query.price.$gte = s.minPrice;
          if (s.maxPrice != null) query.price.$lte = s.maxPrice;
        }

        const listings = await Listing.find(query)
          .select(CARD_SELECT)
          .sort({ isFeatured: -1, createdAt: -1 })
          .limit(4) // a rail is a teaser; keep the homepage DOM light
          .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT })
          .maxTimeMS(5000)
          .lean();

        return listings.length ? { _id: String(s._id), title: s.title, listings: toCards(listings) } : null;
      })
    );
    return rails.filter(Boolean) as { _id: string; title: string; listings: ReturnType<typeof toCards> }[];
  } catch (e) {
    console.error("getHomepageSections error:", e);
    return [];
  }
}
