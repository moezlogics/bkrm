import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx + tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Intl formatters are costly to build (ICU locale resolution), and
// toLocaleString / toLocaleDateString with a locale build a fresh one on every
// call. Every listing card formats a date and a price, twice per server render
// and again while hydrating on the phone — formatDate alone was the single most
// expensive function on the homepage (~20 ms of server CPU per request).
// Build each formatter once, on first use.
let pkNumber: Intl.NumberFormat | undefined;
let pkDay: Intl.DateTimeFormat | undefined;
let pkDayYear: Intl.DateTimeFormat | undefined;
const fmtNumber = (n: number) => (pkNumber ??= new Intl.NumberFormat("en-PK")).format(n);

/**
 * Format a number as PKR currency
 */
export function formatPrice(price: number): string {
  if (typeof price !== "number" || Number.isNaN(price)) return "Rs. 0";
  return `Rs. ${fmtNumber(Math.round(price))}`;
}

/** How big prices are said in Pakistan: 6,450,000 → "64.5 lakh", 12,500,000 → "1.25 crore". "" under a lakh. */
export function priceInWords(price: number | null | undefined): string {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 100_000) return "";
  const r = (n: number) => String(Math.round(n * 100) / 100);
  return price >= 10_000_000 ? `${r(price / 10_000_000)} crore` : `${r(price / 100_000)} lakh`;
}

/**
 * Format a date string into relative "ago" format (e.g. 'Just now', '15 mins ago', '2 hours ago', '3 days ago', '2 weeks ago', '1 month ago', '1 year ago')
 */
export function formatDate(dateStr: string | Date | number | undefined | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Just now";

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  if (diffYears === 1) return "1 year ago";
  return `${diffYears} years ago`;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

/**
 * Generate a simple unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Debounce a function call
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Slugify a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalise a Listing's `customFieldValues` to a plain object.
 *
 * The schema declares it as a Map, but `.lean()` queries return a plain
 * object instead. Calling `Object.fromEntries()` on that plain object throws
 * "object is not iterable", which took down whole endpoints — GET
 * /api/favourites returned a 500 for any saved ad that had custom fields, so
 * Saved Ads always looked empty. Handles Map, plain object and null.
 */
export function plainCustomFields(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (v instanceof Map) return Object.fromEntries(v);
  if (typeof v === "object") return { ...(v as Record<string, unknown>) };
  return {};
}

/** Human distance: "850 m" · "2.3 km" · "24 km" · "1,020 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${fmtNumber(Math.round(km))} km`;
}
