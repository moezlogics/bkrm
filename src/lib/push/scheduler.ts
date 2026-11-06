/**
 * Background push work, started once per server process (instrumentation):
 *   - campaigns that are due, or whose sender stopped (resumed);
 *   - automatic pushes held back by quiet hours;
 *   - boost-ending reminders (every 30 min);
 *   - subscriber hygiene (daily): devices that keep failing are retired.
 *
 * Every step is safe with many processes: campaigns and held jobs are claimed
 * atomically, reminders are de-duplicated. On a multi-process deployment set
 * PUSH_WORKER=0 on the web processes and run one process with PUSH_WORKER=1
 * (see ecosystem.config.cjs) so big campaigns never share CPU with page
 * rendering.
 */
import dbConnect from "@/lib/mongodb";
import PushJob from "@/models/PushJob";
import PushSubscriber from "@/models/PushSubscriber";
import PushCampaign from "@/models/PushCampaign";
import PushStat from "@/models/PushStat";
import { runNextCampaign } from "@/lib/push/campaigns";
import { pushToUsers } from "@/lib/push/notify";
import { remindEndingBoosts } from "@/lib/push/events";
import { vapidPublicKey } from "@/lib/push/send";

const TICK_MS = 15_000;
// How often boosts ending within a day are looked for (tests lower it).
const BOOST_CHECK_MS = Number(process.env.PUSH_BOOST_CHECK_MS || 30 * 60_000);
type State = { started: boolean; busy: boolean; lastBoost: number; lastHygiene: number };
const g = globalThis as unknown as { __pushScheduler?: State };
const state: State = (g.__pushScheduler ??= { started: false, busy: false, lastBoost: 0, lastHygiene: 0 });

export const isPushWorker = () => process.env.PUSH_WORKER !== "0";

async function sendHeldJobs() {
  const now = new Date();
  const due = await PushJob.find({ sendAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] })
    .sort({ sendAt: 1 }).limit(300).select("_id").lean();
  if (!due.length) return;
  const ids = due.map((d) => d._id);
  // Claim them (another process may be looking at the same jobs).
  const claim = new Date(now.getTime() + 5 * 60_000);
  await PushJob.updateMany({ _id: { $in: ids }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] }, { $set: { lockedUntil: claim } });
  const mine = await PushJob.find({ _id: { $in: ids }, lockedUntil: claim }).lean();
  for (const j of mine as any[]) {
    await pushToUsers([j.userId], { type: j.type, vars: j.vars, url: j.url || "/", image: j.image, icon: j.icon, tag: j.tag }, true)
      .catch((e) => console.error("[push] held job failed:", e?.message));
  }
  await PushJob.deleteMany({ _id: { $in: mine.map((j: any) => j._id) } });
}

async function hygiene() {
  // A device that failed 15 times in a row without a single success is gone.
  await PushSubscriber.updateMany({ status: "active", failCount: { $gte: 15 } }, { $set: { status: "invalid", endedAt: new Date() } });
}

export async function tick() {
  if (state.busy || !vapidPublicKey()) return;
  state.busy = true;
  try {
    await dbConnect();
    // Campaigns first; keep sending while more are due.
    while (await runNextCampaign()) { /* next */ }
    await sendHeldJobs();
    const now = Date.now();
    if (now - state.lastBoost > BOOST_CHECK_MS) { state.lastBoost = now; await remindEndingBoosts(); }
    if (now - state.lastHygiene > 24 * 3_600_000) { state.lastHygiene = now; await hygiene(); }
  } catch (e: any) {
    console.error("[push] scheduler tick failed:", e?.message);
  } finally {
    state.busy = false;
  }
}

/** Start the loop (idempotent). The timer never keeps the process alive on its own. */
export function startPushScheduler() {
  if (state.started || !isPushWorker()) return;
  state.started = true;
  // Production runs with MONGODB_AUTO_INDEX=0 (index builds belong to deploys),
  // which would leave the push collections without their indexes — including
  // the unique endpoint that stops one device being stored (and notified)
  // twice. The one sending process makes sure they exist; a no-op once built.
  void dbConnect()
    .then(() => Promise.all([PushSubscriber, PushJob, PushCampaign, PushStat].map((m) => m.createIndexes())))
    .catch((e) => console.error("[push] index setup failed:", e?.message));
  const t = setInterval(() => void tick(), TICK_MS);
  t.unref?.();
  setTimeout(() => void tick(), 3_000).unref?.();
}

/** Run a tick now (e.g. right after an admin presses Send), if this process sends pushes. */
export function kickPushScheduler() {
  if (isPushWorker()) void tick();
}
