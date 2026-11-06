/**
 * WhatsApp deep-link helper.
 *
 * Builds a wa.me link that opens the seller's chat with a ready-to-send English
 * message pre-filled with the ad title, ID and link — so a buyer just hits send.
 */

/**
 * Normalise a Pakistani number to full international digits (92XXXXXXXXXX).
 *
 * Returns null for anything that isn't a plausible PK number: an unvalidated
 * value produced a wa.me link that silently opened to nothing, so the UI
 * offered a WhatsApp button that could never work.
 */
export function normalizePkNumber(raw?: string | null): string | null {
  if (!raw) return null;
  let n = String(raw).replace(/[^0-9]/g, "");
  if (!n) return null;

  if (n.startsWith("0092")) n = n.slice(2);
  else if (n.startsWith("0")) n = "92" + n.slice(1);        // 03xx… → 923xx…
  else if (!n.startsWith("92") && n.length === 10) n = "92" + n; // 3xx… → 923xx…

  // 92 + 9-11 national digits: covers mobiles (92 3XX XXXXXXX), landlines
  // (92 42 35XXXXXX) and UANs (92 42 111 XXX XXX). This helper also backs the
  // Call button, so it must not reject landline sellers.
  if (!/^92\d{9,11}$/.test(n)) return null;
  return n;
}

export interface WaAdInfo {
  title: string;
  id: string;
  url: string;
  price?: string;
  siteName?: string;
}

export function waMessage(ad: WaAdInfo): string {
  const brand = ad.siteName || process.env.NEXT_PUBLIC_APP_NAME || "Classifieds";
  const lines = [
    `Salam! I saw your ad on ${brand}:`,
    "",
    `📱 *${ad.title}*`,
    ad.price ? `💰 Price: ${ad.price}` : "",
    `🔗 Link: ${ad.url}`,
    "",
    "Is this still available? Can we negotiate on the price? Please let me know. Thanks!",
  ].filter((l) => l !== "");
  return lines.join("\n");
}

/** Full https://wa.me/... link, or null if the number is unusable. */
export function waLink(number: string | null | undefined, ad: WaAdInfo): string | null {
  const n = normalizePkNumber(number);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(waMessage(ad))}`;
}
