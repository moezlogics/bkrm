/**
 * Brute-force protection for sign-in (both the member login and the admin
 * portal), stored in MongoDB so every app instance shares the counts.
 *
 *   per IP + account   — stops guessing one account's password
 *   per IP             — stops one address trying many accounts
 *   per account (admin portal only, high limit) — stops a distributed attack
 *                        on an admin; the owner gets an email when it trips
 *
 * A locked key refuses even the RIGHT password until the lock ends, so the
 * attacker learns nothing. Wrong-password answers stay generic.
 */
import LoginAttempt from "@/models/LoginAttempt";

type Rule = { key: string; max: number; windowMin: number; lockMin: number };

export type Portal = "member" | "admin";

const RULES: Record<Portal, (ip: string, email: string) => Rule[]> = {
  member: (ip, email) => [
    { key: `m:ipacct:${ip}|${email}`, max: 8, windowMin: 15, lockMin: 15 },
    // High: many mobile users share one carrier IP (CGNAT).
    { key: `m:ip:${ip}`, max: 100, windowMin: 15, lockMin: 15 },
  ],
  admin: (ip, email) => [
    { key: `a:ipacct:${ip}|${email}`, max: 5, windowMin: 15, lockMin: 30 },
    { key: `a:ip:${ip}`, max: 10, windowMin: 15, lockMin: 60 },
    { key: `a:acct:${email}`, max: 20, windowMin: 60, lockMin: 60 },
  ],
};

/** The visitor's IP behind Cloudflare / nginx. */
export function requestIp(req?: Request | null): string {
  const h = req?.headers;
  const ip = h?.get("cf-connecting-ip") || h?.get("x-real-ip") || h?.get("x-forwarded-for")?.split(",")[0] || "";
  return ip.trim().slice(0, 64) || "unknown";
}

// Production runs with auto-indexing off: build the unique key + expiry indexes once.
let indexes: Promise<unknown> | null = null;
const ensureIndexes = () => (indexes ??= LoginAttempt.createIndexes().catch((e: any) => { indexes = null; console.error("[login-guard] indexes:", e?.message); }));

/**
 * Minutes until sign-in is allowed again, or 0. `familiar` = the account last
 * signed in successfully from this IP: the account-wide lock then doesn't
 * apply, so an attacker can't lock the real admin out by failing on purpose.
 */
export async function lockedFor(portal: Portal, ip: string, email: string, familiar = false): Promise<number> {
  await ensureIndexes();
  const rules = RULES[portal](ip, email).filter((r) => !(familiar && r.key.includes(":acct:")));
  const rows = await LoginAttempt.find({ key: { $in: rules.map((r) => r.key) }, lockedUntil: { $gt: new Date() } }).select("lockedUntil").lean();
  if (!rows.length) return 0;
  const until = Math.max(...rows.map((r: any) => new Date(r.lockedUntil).getTime()));
  return Math.max(1, Math.ceil((until - Date.now()) / 60_000));
}

/** Count a failure. Returns the keys that just became locked. */
export async function recordFailure(portal: Portal, ip: string, email: string): Promise<string[]> {
  const now = new Date();
  const locked: string[] = [];
  for (const r of RULES[portal](ip, email)) {
    const windowStart = new Date(now.getTime() - r.windowMin * 60_000);
    // Start a new window when the old one is over; otherwise add one.
    let row: any = await LoginAttempt.findOneAndUpdate(
      { key: r.key, windowStart: { $gte: windowStart } },
      { $inc: { fails: 1 }, $set: { expiresAt: new Date(now.getTime() + (r.windowMin + r.lockMin) * 60_000) } },
      { new: true },
    ).lean();
    if (!row) {
      row = await LoginAttempt.findOneAndUpdate(
        { key: r.key },
        { $set: { fails: 1, windowStart: now, lockedUntil: null, expiresAt: new Date(now.getTime() + (r.windowMin + r.lockMin) * 60_000) } },
        { upsert: true, new: true },
      ).lean().catch(() => null);
    }
    if (row && row.fails >= r.max && !(row.lockedUntil && new Date(row.lockedUntil) > now)) {
      await LoginAttempt.updateOne({ key: r.key }, { $set: { lockedUntil: new Date(now.getTime() + r.lockMin * 60_000), expiresAt: new Date(now.getTime() + r.lockMin * 60_000) } });
      locked.push(r.key);
    }
  }
  return locked;
}

/** A good sign-in clears the per-IP+account counter (not the IP-wide one). */
export async function recordSuccess(portal: Portal, ip: string, email: string) {
  const keys = RULES[portal](ip, email).filter((r) => r.key.includes(":ipacct:")).map((r) => r.key);
  await LoginAttempt.deleteMany({ key: { $in: keys } }).catch(() => {});
}
