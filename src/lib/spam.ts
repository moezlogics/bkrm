/**
 * Spam "brain" — heuristic risk scorer for new listings (pure, no server deps,
 * safe to import on the client too — the vertical config is plain data). A
 * separate LLM pass (spam-ai.ts) layers on
 * top when an OpenAI key is configured.
 */

import { VERTICAL } from "@/vertical";

export interface SpamInput {
  title: string;
  description?: string;
  price?: number | null;
  categoryTopSlug?: string;
  images?: string[];
  contactNumber?: string;
  whatsappNumber?: string;
  condition?: string | null;
}

export interface SpamResult {
  score: number; // 0–100
  reasons: string[];
  action: "approve" | "review";
}

export const SPAM_HOLD_THRESHOLD = 55;

const SCAM_PHRASES = [
  "double your money", "investment plan", "lottery", "you have won", "claim your prize",
  "western union", "money transfer", "bitcoin", "crypto", "forex", "earn from home",
  "100% guaranteed", "no risk", "click here", "advance payment only", "token amount",
  "gift", "loan", "casino", "betting", "get rich", "money back", "limited offer only",
];

// Below this, a price in the section is bait (per vertical: src/vertical/*).
const PRICE_FLOOR: Record<string, number> = VERTICAL.priceFloor;

const urlRegex = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|pk|io|co|xyz|shop|store)\b)/i;
const emailRegex = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9.-]+\.[a-z]{2,}/i;

/**
 * Detects contact info hidden in free text, INCLUDING obfuscated phone numbers
 * like "0-3-1-1-2-1-4-3-XXX", "0 3 1 1 …", "O3II…". Buyers must use the contact
 * fields, so any phone/url/email in title/description is flagged.
 */
export function containsContactInfo(text: string): { phone: boolean; url: boolean; email: boolean } {
  const raw = (text || "").toString();
  // Normalise common obfuscations to digits, then compact out separators.
  const deLeet = raw
    .replace(/[oO]/g, "0")
    .replace(/[il|]/g, "1")
    .replace(/\bthree\b/gi, "3").replace(/\bfour\b/gi, "4").replace(/\bfive\b/gi, "5")
    .replace(/\bsix\b/gi, "6").replace(/\bseven\b/gi, "7").replace(/\beight\b/gi, "8")
    .replace(/\bnine\b/gi, "9").replace(/\bzero\b/gi, "0").replace(/\bone\b/gi, "1").replace(/\btwo\b/gi, "2");
  const compact = deLeet.replace(/[\s.\-_()+/,]/g, "");

  const phone =
    /(?:\+?92|0)?3\d{8,9}/.test(compact) ||   // PK mobile core (03xxxxxxxxx / 923…)
    /\d{10,}/.test(compact) ||                // any 10+ digit run (dates are ≤8)
    /(?:\d[\s.\-_]{0,2}){10,}/.test(raw);     // 10+ separated digit groups
  const url = urlRegex.test(raw);
  const email = emailRegex.test(raw);
  return { phone, url, email };
}

export function scoreListing(input: SpamInput): SpamResult {
  const reasons: string[] = [];
  let score = 0;
  const title = (input.title || "").trim();
  const desc = (input.description || "").trim();
  const text = `${title} ${desc}`;
  const lower = text.toLowerCase();

  const hits = SCAM_PHRASES.filter((p) => lower.includes(p));
  if (hits.length) { score += Math.min(55, hits.length * 28); reasons.push(`Scam-like wording: ${hits.slice(0, 2).join(", ")}`); }

  const contact = containsContactInfo(text);
  if (contact.phone) { score += 45; reasons.push("Phone number in text (use the contact field)"); }
  if (contact.url) { score += 30; reasons.push("External link in text"); }
  if (contact.email) { score += 25; reasons.push("Email in text"); }

  const floor = input.categoryTopSlug ? PRICE_FLOOR[input.categoryTopSlug] : undefined;
  if (floor != null && input.price != null && input.price > 0 && input.price < floor) { score += 35; reasons.push("Price suspiciously low for the category"); }
  if (input.price != null && input.price <= 0) { score += 10; reasons.push("Missing/zero price"); }

  if (title.length < 6) { score += 20; reasons.push("Title too short"); }
  const letters = title.replace(/[^a-z]/gi, "").length;
  if (title.length >= 8 && letters / title.length < 0.4) { score += 15; reasons.push("Title looks like gibberish"); }
  const capsWords = title.split(/\s+/).filter((w) => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length >= 4) { score += 10; reasons.push("Excessive ALL-CAPS"); }
  if (/(.)\1{5,}/.test(lower)) { score += 10; reasons.push("Repeated characters"); }
  if (!input.images || input.images.length === 0) { score += 8; reasons.push("No photos"); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons, action: score >= SPAM_HOLD_THRESHOLD ? "review" : "approve" };
}
