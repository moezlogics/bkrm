/**
 * Search keywords — shared by the app (model hook, search) and the CLI
 * re-index script, so stored keywords and query words are always normalised
 * the same way. Plain JS so `node scripts/reindex-keywords.mjs` can use it.
 */

/** @param {unknown} s */
export function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    // "cd70" / "ybr125" → "cd 70" / "ybr 125": model codes match however they're typed
    .replace(/([a-z])(\d)/g, "$1 $2")
    // "1300 cc" / "45,000 km" → "1300cc" / "45000km"
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/(\d+)\s*(cc|km|kw|kwh|hp|w)\b/g, "$1$2")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {unknown} s */
const words = (s) => normalizeText(s).split(" ").filter(Boolean);

// Spec values worth finding an ad by ("2019", "automatic", "diesel", "125cc"…).
// Slugs a vertical doesn't use are simply absent from its ads.
const SPEC_KEYS = [
  "model_year", "fuel_type", "transmission", "body_type", "assembly", "engine_capacity",
  "exterior_color", "color", "colour", "starter", "battery_type", "fits_make",
];
const MAX_KW = 64;

/**
 * Keywords for one listing: title words, the names of its category chain
 * (section, brand, model), key specs and condition.
 * @param {{ name?: string, categoryNames?: string[], specs?: any, condition?: string | null }} o
 * @returns {string[]}
 */
export function listingKeywords(o) {
  const out = new Set();
  for (const w of words(o.name)) out.add(w);
  for (const n of o.categoryNames || []) for (const w of words(n)) out.add(w);
  const specs = o.specs instanceof Map ? Object.fromEntries(o.specs) : o.specs || {};
  for (const k of SPEC_KEYS) {
    const v = specs[k];
    for (const item of Array.isArray(v) ? v : [v]) for (const w of words(item)) out.add(w);
  }
  if (o.condition) for (const w of words(o.condition)) out.add(w);
  return Array.from(out).filter((w) => w.length <= 30).slice(0, MAX_KW);
}
