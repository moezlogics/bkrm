/**
 * Trust badges — one definition used everywhere, so a badge always means the
 * same thing:
 *
 *  - "shop"   Verified shop    — a registered shop, ID checked by admin (level 3)
 *  - "seller" Verified seller  — CNIC (number, front & back) approved by admin
 *  - "user"   Verified user    — a BUYING account with a confirmed email AND a
 *                                 mobile number on the account
 *
 * Selling accounts are held to the seller standard: switching a verified buyer
 * account to selling does NOT carry the tick over — it used to, so anyone
 * could sell with a tick after typing a phone number. A seller shows no badge
 * until the admin has approved their CNIC.
 *
 * The phone number itself is not claimed as checked — there is no SMS
 * provider — the CNIC review is the real check.
 */
export type TrustKind = "shop" | "seller" | "user" | null;

type TrustInput = {
  verificationLevel?: number | null;
  verificationStatus?: string | null;
  emailVerified?: boolean | null;
  provider?: string | null;
  isSeller?: boolean | null; // false = buying account; missing = treated as selling
  phoneNumber?: string | null;
} | null | undefined;

export const hasPhone = (p?: string | null) => !!p && /\d{10,}/.test(p.replace(/\D/g, ""));

/** Admin approved the ID document (level 2+, or the approved status). */
export const idChecked = (u: NonNullable<TrustInput>) =>
  Number(u.verificationLevel || 0) >= 2 || u.verificationStatus === "verified";

export function trustKind(u?: TrustInput): TrustKind {
  if (!u) return null;
  const lvl = Number(u.verificationLevel || 0);
  if (u.isSeller !== false) {
    // Selling: only an admin-approved CNIC counts.
    if (lvl >= 3) return "shop";
    if (idChecked(u)) return "seller";
    return null;
  }
  if (idChecked(u)) return "user";
  if ((u.emailVerified || u.provider === "google") && hasPhone(u.phoneNumber)) return "user";
  return null;
}

/** What's left before a member shows as verified — for the "Verify your account" steps. */
export function verifySteps(u: {
  emailVerified?: boolean | null; provider?: string | null; phoneNumber?: string | null;
  verificationStatus?: string | null; verificationLevel?: number | null;
}) {
  return {
    email: !!(u.emailVerified || u.provider === "google"),
    phone: hasPhone(u.phoneNumber),
    /** Seller check: "none" | "pending" | "rejected" | "approved" */
    cnic: idChecked(u) ? "approved" : u.verificationStatus === "pending" ? "pending" : u.verificationStatus === "rejected" ? "rejected" : "none",
  } as const;
}

export const TRUST_LABEL: Record<Exclude<TrustKind, null>, { label: string; title: string }> = {
  shop: { label: "Verified shop", title: "Registered shop — ID checked by our team" },
  seller: { label: "Verified seller", title: "CNIC checked by our team" },
  user: { label: "Verified user", title: "Email confirmed and mobile number added" },
};
