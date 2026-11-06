import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import { suggestCategories, popularCategories, tokensOf, keywordMatch } from "@/lib/search";
import { TtlLru } from "@/lib/memo";
import { isCdnImage, cdnLoader } from "@/lib/cdn-image";
import { withBasePath } from "@/lib/base-path";

/** 96px thumbnail — never ship a full-size photo into a dropdown row. */
function thumb(src?: string | null): string | null {
  if (!src) return null;
  if (isCdnImage(src)) return cdnLoader({ src, width: 96, quality: 70 });
  return /^(\/|https?:)/.test(src) ? withBasePath(`/_next/image?url=${encodeURIComponent(withBasePath(src))}&w=96&q=75`) : null;
}

// Every keystroke of every visitor lands here; the same prefixes ("sam",
// "iph") repeat all day, so answers are kept 30 s per instance.
const answers = new TtlLru<Record<string, unknown>>(2000, 30_000);

/**
 * GET /api/search/suggest?q=
 * Powers the live dropdown under every search box:
 *  - categories: brands / models / sections matching what's typed (with live
 *    ad counts) — tapping one opens that archive;
 *  - ads: a few matching listings;
 *  - with an empty query, popular sections.
 * Same answer for everyone for a given q, so it's cacheable at the edge.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 80);
  const tokens = tokensOf(q);
  const headers = { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" };

  const body = await answers.memo(tokens.join(" "), () => answer(q, tokens));
  return NextResponse.json({ ...body, q }, { headers });
}

async function answer(q: string, tokens: string[]): Promise<Record<string, unknown>> {
  if (!tokens.length) return { categories: [], ads: [], popular: await popularCategories() };

  await dbConnect();
  const [categories, ads] = await Promise.all([
    suggestCategories(q, 6),
    // Keyword index, newest first — never a regex scan over every title.
    keywordMatch(tokens).then((m) =>
      Listing.find({ status: "approved", ...m })
        .sort({ createdAt: -1 })
        .limit(4)
        .select("name slug price priceMode mainImage galleryImages city")
        .maxTimeMS(2000)
        .lean()),
  ]);

  return {
    categories: categories.map((c) => ({ name: c.name, href: `/${c.path}`, context: c.context, n: c.n })),
    ads: (ads as any[]).map((a) => ({
      title: a.name,
      href: `/ads/${a.slug}`,
      price: a.priceMode === "free" ? "Free" : a.price != null ? `Rs ${Number(a.price).toLocaleString("en-PK")}` : "Contact for price",
      image: thumb(a.mainImage || a.galleryImages?.[0]),
      city: a.city || "",
    })),
  };
}
