/**
 * Pakistani mobile numbers, stored one way: "03XXXXXXXXX".
 * Accepts 03001234567, 0300-1234567, +92 300 1234567, 923001234567.
 * Returns null for anything else ("" input → "").
 */
export function normalizePkMobile(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (!/^(\+?92|0)?3\d{9}$/.test(digits)) return null;
  return "0" + digits.replace(/^(\+?92|0)/, "");
}

export const PHONE_HINT = "Enter a valid mobile number, e.g. 03001234567";
