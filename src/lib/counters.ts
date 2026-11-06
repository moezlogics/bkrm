/**
 * Write-behind counters for hot, loss-tolerant stats: ad impressions, views
 * and leads (taps on Call, WhatsApp and Live Chat).
 *
 * Every feed a visitor scrolls reports impressions and every ad opened reports
 * a view. Writing each one straight away meant one DB write per event (per
 * card, per visitor) — at scale the busiest ads become write hot-spots and the
 * database spends its time on counters instead of pages. Instead events are
 * summed in memory and written every few seconds as ONE bulkWrite with a
 * single $inc per ad, however many people viewed it in between (the same
 * approach large feeds use for like/view counts). The same flush adds the
 * totals to today's row in `daily_stats`, which the admin dashboard charts.
 *
 * Trade-off: a crash loses at most FLUSH_MS of counts. Sellers' live
 * dashboards get one aggregated push per ad per flush.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import { pushSellerStat } from "@/lib/pusher";
import { onViewsCounted } from "@/lib/push/events";

const FLUSH_MS = Number(process.env.COUNTER_FLUSH_MS || 3000);
/** Flush early if this many ads are pending (bounds memory under a spike). */
const MAX_PENDING = 5000;

export type ContactKind = "call" | "whatsapp" | "chat";
const CONTACT_FIELD: Record<ContactKind, "phoneClicks" | "whatsappClicks" | "chatClicks"> = {
  call: "phoneClicks",
  whatsapp: "whatsappClicks",
  chat: "chatClicks",
};

type Field = "impressions" | "clicks" | "phoneClicks" | "whatsappClicks" | "chatClicks";
type State = { pending: Map<string, Partial<Record<Field, number>>>; timer: ReturnType<typeof setTimeout> | null; flushing: Promise<void> | null };
// One buffer per process, surviving dev hot reloads.
const g = globalThis as unknown as { __adCounters2?: State };
const state: State = (g.__adCounters2 ??= { pending: new Map(), timer: null, flushing: null });

function add(id: string, field: Field, n = 1) {
  if (!mongoose.isValidObjectId(id)) return;
  const row = state.pending.get(id) || {};
  row[field] = (row[field] || 0) + n;
  state.pending.set(id, row);
  if (state.pending.size >= MAX_PENDING) { void flushCounters(); return; }
  if (!state.timer) state.timer = setTimeout(() => { state.timer = null; void flushCounters(); }, FLUSH_MS);
}

export function countImpressions(ids: string[]) {
  for (const id of ids) add(id, "impressions");
}

export function countView(id: string) {
  add(id, "clicks");
}

/** A tap on Call, WhatsApp or Live Chat — the strongest signal an ad produces. */
export function countContact(id: string, kind: ContactKind) {
  const field = CONTACT_FIELD[kind];
  if (field) add(id, field);
}

/** Pakistan-time day key ("2026-10-28") for the daily totals. */
export function statDay(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Write everything pending now (also used by tests and graceful shutdown). */
export async function flushCounters(): Promise<void> {
  if (state.flushing) await state.flushing;
  if (!state.pending.size) return;
  const batch = state.pending;
  state.pending = new Map();

  state.flushing = (async () => {
    const ops = Array.from(batch, ([id, inc]) => ({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(id) }, update: { $inc: inc } } }));
    const day: Record<string, number> = {};
    for (const inc of batch.values()) for (const [k, v] of Object.entries(inc)) day[k] = (day[k] || 0) + (v || 0);
    try {
      await dbConnect();
      await Listing.bulkWrite(ops as any, { ordered: false });
      // Today's totals for the admin charts (views are stored as `clicks`, like on ads).
      await mongoose.connection.db!.collection<{ _id: string }>("daily_stats")
        .updateOne({ _id: statDay() }, { $inc: day }, { upsert: true })
        .catch((e) => console.warn("[counters] daily totals not saved:", e?.message));
    } catch (e: any) {
      console.error("[counters] flush failed:", e?.message);
      return;
    }
    // Live seller dashboards: one push per viewed ad per flush.
    const viewed = [...batch].filter(([, inc]) => inc.clicks).map(([id, inc]) => [id, inc.clicks!] as const);
    if (viewed.length) {
      const views = new Map(viewed);
      const owners = await Listing.find({ _id: { $in: [...views.keys()] } }).select("userId clicks name slug").lean().catch(() => []);
      // Sellers hear about milestones ("100 people viewed your ad") by push.
      onViewsCounted((owners as any[]).map((o) => ({ _id: o._id, name: o.name, slug: o.slug, userId: o.userId, clicks: o.clicks || 0, added: views.get(String(o._id)) || 0 })));
      for (const o of owners as any[]) {
        if (o.userId) pushSellerStat(String(o.userId), { type: "view", listingId: String(o._id), delta: views.get(String(o._id)) || 1 });
      }
    }
  })().finally(() => { state.flushing = null; });
  await state.flushing;
}
