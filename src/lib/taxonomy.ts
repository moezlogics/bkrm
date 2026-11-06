/**
 * Taxonomy helpers (server-only).
 *
 * When a seller posts, the brand/model they pick may not exist yet as a Category
 * node — we create it on the fly so the archive URL (e.g.
 * /cars/toyota/toyota-corolla-cross) comes into existence exactly when
 * the first listing chooses it. Categories are never shown when empty (the
 * browse route 404s empty locations), so this is safe.
 */
import Category from "@/models/Category";
import { expireTag } from "@/lib/catalog";

export const seg = (s: string) =>
  s.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const modelSeg = (brand: string, model: string) =>
  model.toLowerCase().startsWith(brand.toLowerCase()) ? seg(model) : seg(`${brand} ${model}`);

export const modelName = (brand: string, model: string) =>
  model.toLowerCase().startsWith(brand.toLowerCase()) ? model.trim() : `${brand.trim()} ${model.trim()}`;

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 0;
  while (await Category.findOne({ slug })) { n++; slug = `${base}-${n}`; }
  return slug;
}

async function ensureChild(parent: any, segment: string, name: string): Promise<any> {
  const path = `${parent.path}/${segment}`;
  const existing = await Category.findOne({ path });
  if (existing) return existing;
  return createCategory({
    name,
    slug: await uniqueSlug(`${parent.slug}-${segment}`),
    path,
    parentCategoryId: parent._id,
    sequence: 99,
    status: true,
    listingType: parent.listingType || "item",
    priceMode: parent.priceMode || "negotiable",
    conditionSet: parent.conditionSet || ["new", "used"],
    showCondition: parent.showCondition !== false,
  });
}

/**
 * Resolve the leaf Category a listing should attach to, creating the brand and
 * model nodes under `top` if they don't exist yet. Returns `top` if no brand.
 */
export async function ensureBrandModelLeaf(top: any, brand?: string | null, model?: string | null): Promise<any> {
  if (!brand || !brand.trim()) return top;
  const brandDoc = await ensureChild(top, seg(brand), brand.trim());
  if (!model || !model.trim()) return brandDoc;
  // model slug already carries the brand prefix → keep it globally-unique-ish
  const mSeg = modelSeg(brand, model);
  const path = `${brandDoc.path}/${mSeg}`;
  const existing = await Category.findOne({ path });
  if (existing) return existing;
  return createCategory({
    name: modelName(brand, model),
    slug: await uniqueSlug(mSeg),
    path,
    parentCategoryId: brandDoc._id,
    sequence: 99,
    status: true,
    listingType: top.listingType || "item",
    priceMode: top.priceMode || "negotiable",
    conditionSet: top.conditionSet || ["new", "used"],
    showCondition: top.showCondition !== false,
  });
}

/** Ancestor chain [top, …, leaf] as id strings, for Listing.allCategoryIds. */
export async function ancestorIds(leaf: any): Promise<string[]> {
  const ids: string[] = [leaf._id.toString()];
  let cur = leaf;
  while (cur?.parentCategoryId) {
    const parent = await Category.findById(cur.parentCategoryId).select("_id parentCategoryId").lean();
    if (!parent) break;
    ids.push(parent._id.toString());
    cur = parent;
  }
  return ids.reverse();
}

/**
 * Create a category and expire the cached catalog immediately, so the new
 * brand/model archive resolves on the very next request (a seller is sent to
 * their new ad straight after posting, and its breadcrumb links there).
 */
async function createCategory(doc: Record<string, unknown>) {
  const created = await Category.create(doc);
  expireTag("categories");
  return created;
}
