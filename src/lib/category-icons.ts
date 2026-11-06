/**
 * Category icons — the vertical's icon registry (src/vertical/icons), shared
 * by the home tiles, the sell wizard and the admin icon picker, so an icon
 * chosen in the admin always renders.
 */
import { ICONS, iconFor, type SpecIconKey } from "@/vertical/icons";
import { VERTICAL } from "@/vertical";

export const CATEGORY_ICONS = ICONS;
export type CategoryIconKey = SpecIconKey;

/** A category's icon, falling back to the vertical's own (car / motorbike). */
export function categoryIcon(key?: string | null) {
  return key && key in ICONS ? iconFor(key) : iconFor(VERTICAL.icon);
}
