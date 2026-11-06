/**
 * Cached spec-field definitions (the CustomField registry) — names, units and
 * order for the ad page's details table, cards and filters. They change only
 * when an admin edits a field (or a seller adds a new option), and those
 * writers expire the "categories" tag.
 */
import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/mongodb";
import CustomField from "@/models/CustomField";

export type FieldDef = {
  _id: string; name: string; slug: string; type: string; unit?: string | null;
  group?: string | null; sequence: number; filterable?: boolean;
  min?: number | null; max?: number | null; values?: string[]; categoryIds: string[];
};

const loadDefs = unstable_cache(
  async (): Promise<FieldDef[]> => {
    await dbConnect();
    const rows = await CustomField.find({ status: true })
      .select("name slug type unit group sequence filterable min max values categoryIds")
      .sort({ sequence: 1, name: 1 })
      .lean();
    return JSON.parse(JSON.stringify(rows));
  },
  ["field-defs-v1"],
  { tags: ["categories"], revalidate: 3600 },
);

/** Fields that apply to a top category (every brand/model under it inherits them). */
export async function fieldDefsFor(topCategoryId: string | null | undefined): Promise<FieldDef[]> {
  const all = await loadDefs();
  if (!topCategoryId) return [];
  const id = String(topCategoryId);
  return all.filter((f) => (f.categoryIds || []).map(String).includes(id));
}

/** Every active field, keyed by slug (first definition wins). */
export async function fieldDefsBySlug(): Promise<Map<string, FieldDef>> {
  const m = new Map<string, FieldDef>();
  for (const f of await loadDefs()) if (!m.has(f.slug)) m.set(f.slug, f);
  return m;
}

/** "45,000 km", "1300 cc", "2021", "ABS, Airbags" — a stored value as people read it. */
export function displayValue(def: Pick<FieldDef, "type" | "unit" | "slug"> | undefined, value: unknown): string {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  const numeric = def && ["number", "decimal", "range"].includes(def.type);
  if (numeric && Number.isFinite(Number(value))) {
    const n = Number(value);
    // Years and engine/motor figures read plain ("2021", "1800 cc", "1200 W");
    // distances and counts get separators ("45,000 km").
    const plain = /year/.test(def!.slug) || /^(cc|w|kw|hp)$/i.test(def!.unit || "");
    const s = plain ? String(Math.round(n)) : n.toLocaleString("en-US");
    // Money reads the Pakistani way round: "Rs 4,000", not "4,000 Rs" ("Rs/kg" stays a suffix).
    if (/^(rs|pkr)$/i.test(def!.unit || "")) return `${def!.unit} ${s}`;
    return def!.unit ? `${s} ${def!.unit}` : s;
  }
  return String(value);
}
