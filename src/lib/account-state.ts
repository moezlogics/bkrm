/**
 * Who a signed-in token belongs to right now.
 *
 * Sessions are JWTs that live for weeks, and the role inside one was written at
 * sign-in. Without a live check, blocking someone, removing an admin or
 * deleting an account changed nothing for a browser that was already signed
 * in: a removed admin kept full admin access until the token ran out. Every
 * session read asks here instead. Answers are cached per process for a few
 * seconds, and admin actions call forgetAccount() so they apply at once.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export interface AccountState {
  role: "user" | "admin";
  blocked: boolean;
  /** "Sign out everywhere": tokens from sign-ins before this time (ms) are refused. */
  revokedAt: number;
}

const TTL_MS = 15_000;
type Entry = { at: number; v: AccountState | null };
const g = globalThis as unknown as { __accountState?: Map<string, Entry> };
const cache: Map<string, Entry> = (g.__accountState ??= new Map());

async function load(userId: string): Promise<AccountState | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  await dbConnect();
  const u: any = await User.findById(userId).select("role isBlocked sessionsRevokedAt").lean();
  const v: AccountState | null = u
    ? { role: u.role === "admin" ? "admin" : "user", blocked: !!u.isBlocked, revokedAt: u.sessionsRevokedAt ? +new Date(u.sessionsRevokedAt) : 0 }
    : null;
  if (cache.size > 10_000) cache.clear();
  cache.set(userId, { at: Date.now(), v });
  return v;
}

/** Drop the cached answer for one account (after an admin changes it). */
export function forgetAccount(userId: unknown) {
  cache.delete(String(userId));
}

/**
 * The account behind a token signed in at `signedInAtMs`:
 *   - null: the token must not be honoured (account gone, blocked, or signed
 *     out everywhere since);
 *   - "unknown": the database could not be asked, so keep what the token says
 *     (a database outage must not sign everyone out);
 *   - otherwise the live role.
 */
export async function liveAccount(userId: string, signedInAtMs?: number): Promise<AccountState | null | "unknown"> {
  if (!mongoose.isValidObjectId(userId)) return null;
  let s: AccountState | null;
  try {
    s = await load(String(userId));
  } catch {
    return "unknown";
  }
  if (!s || s.blocked) return null;
  // A second of slack: the revoke and a sign-in can land in the same second.
  if (s.revokedAt && signedInAtMs && signedInAtMs < s.revokedAt - 1000) return null;
  return s;
}
