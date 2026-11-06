import { MetadataRoute } from "next";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/Category";
import City from "@/models/City";
import CmsPage from "@/models/CmsPage";
import BlogPost from "@/models/BlogPost";
import { getBaseUrl } from "@/lib/seo";
import { getScopeCounts } from "@/lib/scope-counts";

// Built per request from live data (cheap: the counts are cached). It used to be
// generated once at build time, so categories, cities and posts added after a
// deploy never reached the sitemap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/ads`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  ];

  try {
    await dbConnect();

    // Listings are intentionally excluded from sitemap because individual ads have 'noindex, follow'
    // and canonicalize to their parent national model archive page.
    const [categories, cities, cmsPages, blogPosts, counts] = await Promise.all([
      Category.find({ status: true }).select("_id slug path updatedAt").lean(),
      City.find({ isActive: true }).select("_id slug updatedAt").lean(),
      CmsPage.find({ status: true }).select("slug updatedAt").lean(),
      BlogPost.find({ status: "published" }).select("slug updatedAt").lean(),
      getScopeCounts(),
    ]);
    // Only archives with live ads: empty ones are noindexed (or 404), and
    // listing them makes Search Console report errors.
    const live = (m: Map<string, number>, id: unknown) => (m.get(String(id)) || 0) > 0;

    const categoryRoutes: MetadataRoute.Sitemap = categories.filter((c: any) => live(counts.cat, c._id)).map((c: any) => ({
      url: `${base}/${c.path || c.slug}`,
      lastModified: c.updatedAt ? new Date(c.updatedAt) : new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    }));

    const cityRoutes: MetadataRoute.Sitemap = cities.filter((c: any) => live(counts.city, c._id)).map((c: any) => ({
      url: `${base}/${c.slug}`,
      lastModified: c.updatedAt ? new Date(c.updatedAt) : new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    }));

    const cmsRoutes: MetadataRoute.Sitemap = cmsPages.map((p: any) => ({
      url: `${base}/page/${p.slug}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    }));
    const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((p: any) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    }));

    return [...staticRoutes, ...categoryRoutes, ...cityRoutes, ...cmsRoutes, ...blogRoutes];
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return staticRoutes;
  }
}
