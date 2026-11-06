import dbConnect from "@/lib/mongodb";
import Category from "@/models/Category";
import CustomField from "@/models/CustomField";
import { getCatalog } from "@/lib/catalog";
import { getSetting } from "@/lib/settings";

/** Everything the sell wizard needs (shared by /ads/post and /ads/[slug]/edit). */
export async function getWizardData() {
  await dbConnect();
  const [tops, allCats, fields, catalog, maxPhotos] = await Promise.all([
    Category.find({ parentCategoryId: null, status: true }).select("name slug path icon conditionSet showCondition sequence").sort({ sequence: 1 }).lean(),
    Category.find({ status: true }).select("name slug path parentCategoryId sequence").sort({ sequence: 1 }).lean(),
    CustomField.find({ status: true })
      .select("name slug type required values unit placeholder helpText group categoryIds sequence allowCustom min max")
      .sort({ sequence: 1 }).lean(),
    getCatalog(),
    getSetting("max_photos_per_ad", "12"),
  ]);
  const cities = catalog.cities.map((c) => ({ name: c.name, slug: c.slug }));
  const areas = catalog.areas.map((a) => ({ name: a.name, slug: a.slug, citySlug: a.citySlug }));
  return {
    ...JSON.parse(JSON.stringify({ tops, allCats, fields })),
    cities, areas,
    maxPhotos: Math.min(20, Math.max(1, Number(maxPhotos) || 12)),
  };
}
