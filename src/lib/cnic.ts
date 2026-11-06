/**
 * Pakistani CNIC numbers: 13 digits, written 12345-1234567-1.
 * Safe to import on the server and in the browser.
 */
export const cnicDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 13);

/** "3520212345671" or "35202-1234567-1" → "35202-1234567-1" (partial input formats as typed). */
export function formatCnic(v: unknown): string {
  const d = cnicDigits(v);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/** A full, plausible CNIC (13 digits, not all the same digit), formatted — or null. */
export function normalizeCnic(v: unknown): string | null {
  const d = cnicDigits(v);
  if (d.length !== 13 || /^(\d)\1+$/.test(d) || d.startsWith("0")) return null;
  return formatCnic(d);
}

/** For alerts outside the admin panel (e.g. Discord): 35202-•••••••-1. */
export const maskCnic = (v: unknown) => {
  const f = normalizeCnic(v);
  return f ? `${f.slice(0, 5)}-•••••••-${f.slice(-1)}` : "";
};
