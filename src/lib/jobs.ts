/**
 * Background jobs besides push (lib/push/scheduler), started once per server
 * process from instrumentation:
 *   - ad expiry: dating, expiring and reminding (lib/listing-expiry), every 10 minutes;
 *   - the admin's daily Discord report at 9:00 Pakistan time (lib/admin-digest);
 *   - personal reminders: boost offers, plan ending/ended, unanswered
 *     messages (lib/reminders), and booking reminders where bookings are on.
 *
 * Runs only on the background worker in production (PUSH_WORKER=1, see
 * ecosystem.config.cjs); web processes (PUSH_WORKER=0) leave it alone. Both
 * jobs are safe if more than one process runs them.
 */
const TICK_MS = Number(process.env.JOBS_TICK_MS || 10 * 60_000);
type State = { started: boolean; busy: boolean };
const g = globalThis as unknown as { __jobs?: State };
const state: State = (g.__jobs ??= { started: false, busy: false });

export async function runJobsOnce(): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  try {
    const { runListingExpiry } = await import("@/lib/listing-expiry");
    await runListingExpiry().catch((e) => console.error("[jobs] ad expiry failed:", e?.message));
    const { maybeSendDigest } = await import("@/lib/admin-digest");
    await maybeSendDigest().catch((e) => console.error("[jobs] daily report failed:", e?.message));
    const { runReminders } = await import("@/lib/reminders");
    await runReminders().catch((e) => console.error("[jobs] reminders failed:", e?.message));
    const { BOOKINGS_ON } = await import("@/lib/bookings/enabled");
    if (BOOKINGS_ON) {
      const { runBookingJobs } = await import("@/lib/bookings/jobs");
      await runBookingJobs().catch((e) => console.error("[jobs] bookings failed:", e?.message));
    }
  } finally {
    state.busy = false;
  }
}

export function startJobs() {
  if (state.started || process.env.PUSH_WORKER === "0") return;
  state.started = true;
  const t = setInterval(() => void runJobsOnce(), TICK_MS);
  t.unref?.();
  setTimeout(() => void runJobsOnce(), 60_000).unref?.();
}
