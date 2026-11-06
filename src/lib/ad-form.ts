/**
 * Shared validation + normalisation for the sell wizard (create and edit).
 *
 * Everything the browser checks is checked again here (the client can be
 * bypassed), and this is where seller-supplied novelties are learned:
 * - a city/area we didn't have is created (lib/locations);
 * - an option typed under "Other" (a colour, a warranty) is added to that
 *   field's options for the next seller.
 */
import mongoose from "mongoose";
import Category from "@/models/Category";
import CustomField from "@/models/CustomField";
import { expireTag } from "@/lib/catalog";
import { ensureBrandModelLeaf, ancestorIds } from "@/lib/taxonomy";
import { containsContactInfo } from "@/lib/spam";
import { resolveOrCreateLocation, LocationError } from "@/lib/locations";
import { getSetting } from "@/lib/settings";
import { BASE_PATH } from "@/lib/base-path";

export class AdFormError extends Error {
  constructor(message: string, public field?: string, public status = 400) { super(message); }
}

const CHOICE = new Set(["dropdown", "radio", "multiselect", "checkbox"]);
const MULTI = new Set(["multiselect", "checkbox"]);

function cleanOption(v: unknown): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length > 40) throw new AdFormError("Custom options should be under 40 characters");
  const c = containsContactInfo(s);
  if (c.phone || c.url || c.email) throw new AdFormError("Options can't contain phone numbers or links");
  return s;
}

export function normalizePhone(v: unknown): string {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  const local = digits.startsWith("92") ? "0" + digits.slice(2) : digits;
  return /^0\d{9,10}$/.test(local) ? local : "";
}

export type PreparedAd = {
  fields: Record<string, any>;
  leafName: string;
  topSlug: string;
  newOptions: { fieldId: string; values: string[] }[];
  createdPlaces: string[];
};

/**
 * @param b      request body from the wizard
 * @param existing  the listing being edited (category stays as is)
 */
export async function prepareAd(b: any, userId: string, existing?: any): Promise<PreparedAd> {
  // ── Text ──
  const title = String(b.title ?? "").replace(/\s+/g, " ").trim();
  if (title.length < 5) throw new AdFormError("Please write a title of at least 5 characters", "title");
  if (title.length > 90) throw new AdFormError("The title is too long (90 characters max)", "title");
  const description = String(b.description ?? "").trim().slice(0, 4000);
  const cin = containsContactInfo(`${title} ${description}`);
  if (cin.phone) throw new AdFormError("Please remove the phone number from the title/description — add it in the contact field instead.", "description");
  if (cin.email) throw new AdFormError("Email addresses are not allowed in the title or description.", "description");
  if (cin.url) throw new AdFormError("Links are not allowed in the title or description.", "description");

  // ── Category ──
  let leaf: any, top: any;
  if (existing) {
    leaf = await Category.findById(existing.categoryId);
    const ids = existing.allCategoryIds?.length ? existing.allCategoryIds : leaf ? await ancestorIds(leaf) : [];
    top = ids.length ? await Category.findById(ids[0]) : leaf;
  } else {
    if (!b.topCategoryId || !mongoose.isValidObjectId(b.topCategoryId)) throw new AdFormError("Please choose a category", "category");
    top = await Category.findById(b.topCategoryId);
    if (!top) throw new AdFormError("Please choose a category", "category");
    leaf = top;
    if (b.subCategoryId) {
      if (!mongoose.isValidObjectId(b.subCategoryId)) throw new AdFormError("Invalid sub-category", "category");
      leaf = await Category.findById(b.subCategoryId);
      if (!leaf) throw new AdFormError("Invalid sub-category", "category");
    } else if (b.brand) {
      const brand = cleanOption(b.brand), model = b.model ? cleanOption(b.model) : "";
      leaf = await ensureBrandModelLeaf(top, brand, model);
    }
  }
  if (!leaf || !top) throw new AdFormError("This ad's category no longer exists", "category");

  // ── Specs (custom fields) ──
  const defs: any[] = await CustomField.find({ status: true, categoryIds: top._id }).lean();
  const input = b.customFields && typeof b.customFields === "object" ? b.customFields : {};
  const cf: Record<string, any> = {};
  const newOptions: PreparedAd["newOptions"] = [];
  for (const f of defs) {
    let v = input[f.slug];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (f.required) throw new AdFormError(`${f.name} is required`, `cf:${f.slug}`);
      continue;
    }
    if (CHOICE.has(f.type)) {
      const known = new Map<string, string>((f.values || []).map((x: string) => [x.toLowerCase(), x]));
      const list = (MULTI.has(f.type) ? (Array.isArray(v) ? v : [v]) : [Array.isArray(v) ? v[0] : v]).map(cleanOption).filter(Boolean);
      const out: string[] = [];
      const added: string[] = [];
      for (const item of list.slice(0, 20)) {
        const hit = known.get(item.toLowerCase());
        if (hit) out.push(hit);
        else if (f.allowCustom !== false) { out.push(item); added.push(item); }
      }
      if (!out.length) { if (f.required) throw new AdFormError(`${f.name} is required`, `cf:${f.slug}`); continue; }
      if (added.length && (f.values || []).length < 300) newOptions.push({ fieldId: String(f._id), values: added });
      cf[f.slug] = MULTI.has(f.type) ? out : out[0];
    } else if (["number", "decimal", "year", "range"].includes(f.type)) {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new AdFormError(`${f.name} should be a number`, `cf:${f.slug}`);
      if (f.min != null && n < f.min) throw new AdFormError(`${f.name} should be at least ${f.min}`, `cf:${f.slug}`);
      if (f.max != null && n > f.max) throw new AdFormError(`${f.name} should be at most ${f.max}`, `cf:${f.slug}`);
      cf[f.slug] = n;
    } else if (f.type === "boolean") {
      cf[f.slug] = v === true || v === "Yes" ? "Yes" : "No";
    } else {
      const s = String(v).trim().slice(0, 200);
      const c = containsContactInfo(s);
      if (c.phone || c.url || c.email) throw new AdFormError(`${f.name} can't contain phone numbers or links`, `cf:${f.slug}`);
      if (s) cf[f.slug] = s;
    }
  }

  // ── Condition ──
  // Sections without conditions (animals, services) store none, whatever the browser sent.
  const hasCondition = top.showCondition !== false && (top.conditionSet?.length ?? 0) > 0;
  const condition = hasCondition && b.condition ? String(b.condition) : null;
  const allowed = ["new", "used", "refurbished", "for-parts"];
  if (condition && !allowed.includes(condition)) throw new AdFormError("Please choose a valid condition", "condition");
  if (hasCondition && !condition) throw new AdFormError("Please choose the condition", "condition");

  // ── Photos ──
  // A base path is a plain "/segment" — anything else is dropped rather than escaped.
  const base = BASE_PATH.replace(/[^A-Za-z0-9/_-]/g, "");
  const ownMedia = new RegExp(`^(${base})?/media/(?!private/|p/)`);
  const isAdPhotoUrl = (u: string) => ownMedia.test(u) || /^https?:\/\//.test(u);
  const max = Math.min(20, Math.max(1, Number(await getSetting("max_photos_per_ad", "12")) || 12));
  const images = Array.from(new Set((Array.isArray(b.images) ? b.images : [])
    .filter((u: unknown): u is string => typeof u === "string" && isAdPhotoUrl(u))))
    .slice(0, max);

  // ── Price & Price Drop Detection ──
  const priceNum = b.price != null && b.price !== "" ? Math.round(Number(b.price)) : null;
  if (priceNum == null || !Number.isFinite(priceNum)) throw new AdFormError("Please enter a price", "price");
  if (priceNum < 0 || priceNum > 500_000_000) throw new AdFormError("Please enter a realistic price", "price");

  let previousPrice = existing?.previousPrice ?? null;
  let priceDroppedAt = existing?.priceDroppedAt ?? null;
  if (existing && existing.price != null && priceNum < existing.price) {
    previousPrice = existing.price;
    priceDroppedAt = new Date();
  }

  // ── Location (creates the city/area if new) ──
  let loc;
  try {
    const coords = b.coords && Number.isFinite(Number(b.coords.lat)) && Number.isFinite(Number(b.coords.lng))
      ? { lat: Number(b.coords.lat), lng: Number(b.coords.lng) } : null;
    loc = await resolveOrCreateLocation({ city: b.city, area: b.area, userId, coords });
  } catch (e) {
    if (e instanceof LocationError) throw new AdFormError(e.message, "location");
    throw e;
  }
  const { cityDoc, areaDoc, created } = loc;
  if (!cityDoc) throw new AdFormError("Please choose your city", "location");
  const lng = areaDoc?.longitude ?? cityDoc.longitude ?? 0;
  const lat = areaDoc?.latitude ?? cityDoc.latitude ?? 0;

  // ── Contact ──
  const contactNumber = normalizePhone(b.contactNumber);
  if (!contactNumber) throw new AdFormError("Please enter a valid contact number, e.g. 03001234567", "phone");
  const whatsappNumber = b.whatsappNumber ? normalizePhone(b.whatsappNumber) : contactNumber;
  if (b.whatsappNumber && !whatsappNumber) throw new AdFormError("Please enter a valid WhatsApp number", "phone");

  const allCategoryIds = existing?.allCategoryIds?.length ? existing.allCategoryIds : await ancestorIds(leaf);

  return {
    leafName: leaf.name,
    topSlug: top.slug,
    newOptions,
    createdPlaces: created,
    fields: {
      name: title,
      description,
      price: priceNum,
      previousPrice,
      priceDroppedAt,
      isUrgent: !!b.isUrgent,
      videoLink: typeof b.videoLink === "string" && b.videoLink.trim() ? b.videoLink.trim() : null,
      priceMode: b.negotiable === false ? "fixed" : "negotiable",
      currency: "PKR",
      mainImage: images[0] || "",
      galleryImages: images,
      categoryId: leaf._id,
      allCategoryIds,
      condition,
      customFieldValues: new Map(Object.entries(cf)),
      address: areaDoc ? `${areaDoc.name}, ${cityDoc.name}` : cityDoc.name,
      city: cityDoc.name,
      state: cityDoc.stateName || "",
      country: "Pakistan",
      location: { type: "Point", coordinates: [lng, lat] },
      locationRefs: { cityId: cityDoc._id, areaId: areaDoc?._id || null, stateId: cityDoc.stateId || null },
      contactNumber,
      whatsappNumber: whatsappNumber || contactNumber,
    },
  };
}

/** Save options sellers typed under "Other" so the next seller can pick them. */
export async function learnOptions(newOptions: PreparedAd["newOptions"]) {
  if (!newOptions.length) return;
  await Promise.all(newOptions.map((o) =>
    CustomField.updateOne({ _id: o.fieldId }, { $addToSet: { values: { $each: o.values }, userAddedValues: { $each: o.values } } })
  )).then(() => expireTag("categories")).catch((e) => console.error("learnOptions failed:", e));
}
