/**
 * Sprite icons for listing cards.
 *
 * A feed shows 20-30 cards with five icons each. As lucide components that
 * was ~130 SVGs of 2-6 elements apiece — a third of the homepage's DOM — each
 * built node by node in JS (createElementNS + ~9 setAttribute calls) on every
 * navigation, and rendered twice on the server. Here each shape is defined
 * once, in a hidden sprite in the root layout, and a card icon is just
 * <svg><use/></svg>, which the browser clones natively.
 *
 * Geometry is lucide's own (v1.17), so the icons look identical; stroke and
 * fill come from the `.ico` class in globals.css, so `fill-*` / `text-*`
 * utilities still work as they do on lucide icons.
 */
const SHAPES = {
  heart:
    '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  camera:
    '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  pin:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  chat:
    '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
} as const;

export type CardIconName = keyof typeof SHAPES;

const SPRITE = Object.entries(SHAPES)
  .map(([id, body]) => `<symbol id="ci-${id}" viewBox="0 0 24 24">${body}</symbol>`)
  .join("");

/** Rendered once, in the root layout. */
export function CardIconSprite() {
  return (
    <svg
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      dangerouslySetInnerHTML={{ __html: SPRITE }}
    />
  );
}

export function CardIcon({ name, className }: { name: CardIconName; className?: string }) {
  return (
    <svg className={className ? `ico ${className}` : "ico"} aria-hidden="true">
      <use href={`#ci-${name}`} />
    </svg>
  );
}
