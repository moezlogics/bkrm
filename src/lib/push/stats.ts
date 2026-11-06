/**
 * Push engagement counters, written behind in batches.
 *
 * A campaign to 100,000 devices produces 100,000 "delivered" beacons within a
 * minute or two, plus clicks. Each one used as its own database write would
 * swamp the database; instead they're summed in memory and flushed every few
 * seconds as one bulkWrite per collection (same pattern as lib/counters).
 * A crash loses at most a few seconds of engagement numbers.
 */
import dbConnect from "@/lib/mongodb";
import PushStat from "@/models/PushStat";
import PushCampaign from "@/models/PushCampaign";
import PushSubscriber from "@/models/PushSubscriber";
import { dayKey, currentTimezone } from "@/lib/push/config";

export type StatField = "sent" | "failed" | "delivered" | "clicked" | "closed" | "subscribed" | "unsubscribed";
type Inc = Partial<Record<StatField, number>>;

type State = {
  daily: Map<string, Inc>;            // `${day}|${type}`
  campaigns: Map<string, Inc>;        // campaign id
  clicks: Map<string, number>;        // subscriber endpoint → clicks
  timer: ReturnType<typeof setTimeout> | null;
};
const g = globalThis as unknown as { __pushStats?: State };
const state: State = (g.__pushStats ??= { daily: new Map(), campaigns: new Map(), clicks: new Map(), timer: null });

const FLUSH_MS = 3000;
const add = (m: Map<string, Inc>, k: string, inc: Inc) => {
  const cur = m.get(k) || {};
  for (const [f, n] of Object.entries(inc) as [StatField, number][]) cur[f] = (cur[f] || 0) + n;
  m.set(k, cur);
};
function schedule() {
  if (!state.timer) state.timer = setTimeout(() => { state.timer = null; void flushPushStats(); }, FLUSH_MS);
}

/** Count for the daily dashboard (type = auto type or "campaign"). */
export function bumpStat(type: string, inc: Inc) {
  add(state.daily, `${dayKey(currentTimezone())}|${type}`, inc);
  schedule();
}
export function bumpCampaign(id: string, inc: Inc) {
  add(state.campaigns, id, inc);
  schedule();
}
export function bumpSubscriberClick(endpoint: string) {
  state.clicks.set(endpoint, (state.clicks.get(endpoint) || 0) + 1);
  schedule();
}

export async function flushPushStats() {
  const daily = state.daily, campaigns = state.campaigns, clicks = state.clicks;
  if (!daily.size && !campaigns.size && !clicks.size) return;
  state.daily = new Map(); state.campaigns = new Map(); state.clicks = new Map();
  const $inc = (inc: Inc, prefix = "") => Object.fromEntries(Object.entries(inc).map(([k, v]) => [prefix + k, v]));
  try {
    await dbConnect();
    const now = new Date();
    await Promise.all([
      daily.size && PushStat.bulkWrite(Array.from(daily, ([k, inc]) => {
        const [day, type] = k.split("|");
        return { updateOne: { filter: { day, type }, update: { $inc: $inc(inc) }, upsert: true } };
      }) as any, { ordered: false }),
      campaigns.size && PushCampaign.bulkWrite(Array.from(campaigns, ([id, inc]) => ({
        updateOne: { filter: { _id: id }, update: { $inc: $inc(inc, "stats.") } },
      })) as any, { ordered: false }),
      clicks.size && PushSubscriber.bulkWrite(Array.from(clicks, ([endpoint, n]) => ({
        updateOne: { filter: { endpoint }, update: { $inc: { clickCount: n }, $set: { lastClickAt: now } } },
      })) as any, { ordered: false }),
    ]);
  } catch (e: any) {
    console.error("[push] stats flush failed:", e?.message);
  }
}
