/**
 * New spec fields in the vertical's catalogue (src/vertical/seed) reach a
 * site that was already set up — e.g. the qasai booking rates added after
 * Bakra Mandi's first setup. Runs at server start (instrumentation).
 *
 * Only fields the site has never been offered are added: the slugs offered
 * so far are remembered (Setting "catalogue_fields_seen"), so a field the
 * admin deleted stays deleted. Existing fields are never changed.
 */
import dbConnect from "@/lib/mongodb";
import Category from "@/models/Category";
import CustomField from "@/models/CustomField";
import Setting from "@/models/Setting";
import { SEED } from "@/vertical/seed";

const KEY = "catalogue_fields_seen";

export async function syncNewFields(): Promise<string[]> {
  await dbConnect();
  if (!(await Category.exists({ parentCategoryId: null }))) return []; // not set up yet: /setup adds everything
  const [doc, existing]: [any, any[]] = await Promise.all([
    Setting.findOne({ key: KEY }).lean(),
    CustomField.find().select("slug").lean(),
  ]);
  const inDb = new Set(existing.map((f) => f.slug));
  let seen: string[];
  try { seen = doc?.value ? JSON.parse(doc.value) : [...inDb]; } catch { seen = [...inDb]; }
  const seenSet = new Set(seen);

  const fresh = SEED.fields.filter((f) => !seenSet.has(f.slug) && !inDb.has(f.slug));
  if (fresh.length) {
    const tops: any[] = await Category.find({ parentCategoryId: null, slug: { $in: [...new Set(fresh.flatMap((f) => f.tops))] } }).select("slug").lean();
    const idOf = new Map(tops.map((t) => [t.slug, t._id]));
    await CustomField.insertMany(fresh.map((f) => ({
      name: f.name, slug: f.slug, type: f.type, required: !!f.required, filterable: !!f.filterable,
      searchable: !!f.filterable, values: f.values || [], unit: f.unit || null, min: f.min ?? null, max: f.max ?? null,
      placeholder: f.placeholder || null, helpText: f.helpText || null, group: f.group || null,
      sequence: f.sequence, allowCustom: f.allowCustom ?? f.type === "multiselect", status: true,
      categoryIds: f.tops.map((t) => idOf.get(t)).filter(Boolean),
    })), { ordered: false }).catch((e) => console.error("[catalogue] adding fields failed:", e?.message));
  }
  const all = [...new Set([...seen, ...inDb, ...SEED.fields.map((f) => f.slug)])];
  await Setting.updateOne({ key: KEY }, { $set: { value: JSON.stringify(all), type: "string" } }, { upsert: true });
  if (fresh.length) console.log(`[catalogue] added ${fresh.length} new spec field(s): ${fresh.map((f) => f.slug).join(", ")}`);
  return fresh.map((f) => f.slug);
}
