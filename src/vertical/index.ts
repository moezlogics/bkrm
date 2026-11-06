/**
 * The active vertical: NEXT_PUBLIC_VERTICAL=cars | bikes | bakra (inlined at build
 * time, so client and server agree). Default: cars.
 */
import type { Vertical, VerticalId, SpecDef } from "./types";
import { cars } from "./cars";
import { bikes } from "./bikes";
import { bakra } from "./bakra";

export type { Vertical, VerticalId, SpecDef } from "./types";

const ALL: Record<VerticalId, Vertical> = { cars, bikes, bakra };

const id = (process.env.NEXT_PUBLIC_VERTICAL || "cars").toLowerCase() as VerticalId;
export const VERTICAL: Vertical = ALL[id] || cars;

/** "45,000 km", "2021", "1300 cc" … — how a spec value reads on cards and ad pages. */
export function formatSpec(value: unknown, format?: string): string {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  const n = typeof value === "number" ? value : Number(value);
  const isNum = Number.isFinite(n) && String(value).trim() !== "";
  switch (format) {
    case "km": return isNum ? `${Math.round(n).toLocaleString("en-US")} km` : String(value);
    case "cc": return isNum ? `${Math.round(n)} cc` : String(value);
    case "watts": return isNum ? `${Math.round(n)} W` : String(value);
    case "year": return isNum ? String(Math.round(n)) : String(value);
    // Live weight; big animals are quoted in maunds too (1 man = 40 kg): "380 kg · 9.5 man".
    case "kg": return isNum ? `${Math.round(n).toLocaleString("en-US")} kg${n >= 80 ? ` · ${(Math.round((n / 40) * 10) / 10).toString()} man` : ""}` : String(value);
    case "inch": return isNum ? `${Math.round(n)}″` : String(value);
    default: return String(value);
  }
}

/** The vertical's headline specs present on an ad, formatted: "2021", "45,000 km", "Automatic". */
export function specHighlights(
  values: Record<string, unknown> | Map<string, unknown> | null | undefined,
  specs: SpecDef[] = VERTICAL.cardSpecs,
  max = 4,
): { field: string; label: string; icon: SpecDef["icon"]; value: string }[] {
  if (!values) return [];
  const get = (k: string) => (values instanceof Map ? values.get(k) : (values as Record<string, unknown>)[k]);
  const out: { field: string; label: string; icon: SpecDef["icon"]; value: string }[] = [];
  for (const s of specs) {
    const raw = formatSpec(get(s.field), s.format);
    const value = raw && s.suffix ? `${raw} ${s.suffix}` : raw;
    if (value) out.push({ field: s.field, label: s.label, icon: s.icon, value });
    if (out.length >= max) break;
  }
  return out;
}
