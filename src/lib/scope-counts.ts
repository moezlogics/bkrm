/**
 * Live ad counts for every place × category, computed in ONE background pass.
 *
 * Archive pages, the homepage and search suggestions all need counts ("Gulberg
 * (12)", "Cars 8,420 ads", which brand chips have stock). Computing
 * them per request cost 150-350 ms per query at 300k listings — several per
 * page. Instead one aggregation (~2 s at 300k) runs in the background every
 * few minutes and every request reads the in-memory result (stale-while-
 * revalidate: nobody waits, except the very first request after a boot).
 *
 * Totals per place are derived from top-level categories: every listing's
 * allCategoryIds starts with exactly one top-level category, so summing those
 * rows counts each listing once.
 *
 * Shared across app processes: the snapshot is stored in the `app_stats`
 * collection and a short lease makes sure only ONE process (of however many
 * servers × cores) runs the aggregation per period; the others just read the
 * stored rows. Newly posted/approved/deleted ads adjust the local snapshot
 * immediately (adjustScopeCounts), so sellers never wait for the next pass.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import Category from "@/models/Category";

const TTL_MS = Number(process.env.COUNTS_TTL_MS || 180_000);

export type ScopeCounts = {
  total: number;
  cat: Map<string, number>;          // catId
  city: Map<string, number>;         // cityId
  area: Map<string, number>;         // areaId
  cityCat: Map<string, number>;      // `${cityId}:${catId}`
  areaCat: Map<string, number>;      // `${areaId}:${catId}`
  cityAreas: Map<string, Map<string, number>>; // cityId → areaId → n
  at: number;
};

// Per process (not per module copy), so every route shares one snapshot and
// one refresh.
// `force`: the next pass must re-aggregate, even if the shared snapshot is young.
type State = { current: ScopeCounts | null; inflight: Promise<ScopeCounts> | null; tops: Set<string>; force?: boolean };
const g = globalThis as unknown as { __scopeCounts?: State; __listingScopeDelta?: typeof adjustScopeCounts };
const state: State = (g.__scopeCounts ??= { current: null, inflight: null, tops: new Set() });

type Row = [c: string, a: string, k: string, n: number];
const SNAPSHOT_ID = "scope-counts";
const LEASE_ID = "scope-counts-lease";
/** When another process is mid-refresh, look again this soon. */
const RECHECK_MS = 15_000;

/** The one expensive pass: approved ads grouped by city × area × category. */
async function aggregateRows(): Promise<{ rows: Row[]; tops: string[] }> {
  // Read directly (not via the cached catalog) so this can also run at boot.
  const tops = (await Category.find({ parentCategoryId: null }).select("_id").lean()).map((c: any) => String(c._id));
  const raw: { _id: { c: unknown; a: unknown; k: string }; n: number }[] = await Listing.aggregate([
    { $match: { status: "approved" } },
    { $project: { _id: 0, c: "$locationRefs.cityId", a: "$locationRefs.areaId", k: "$allCategoryIds" } },
    { $unwind: "$k" },
    { $group: { _id: { c: "$c", a: "$a", k: "$k" }, n: { $sum: 1 } } },
  ]).allowDiskUse(true).option({ maxTimeMS: 120_000 });
  return { rows: raw.map(({ _id, n }) => [_id.c ? String(_id.c) : "", _id.a ? String(_id.a) : "", String(_id.k), n]), tops };
}

function build(rows: Row[], topsList: string[], at: number): ScopeCounts {
  const tops = new Set(topsList);
  state.tops = tops;
  const s: ScopeCounts = { total: 0, cat: new Map(), city: new Map(), area: new Map(), cityCat: new Map(), areaCat: new Map(), cityAreas: new Map(), at };
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) || 0) + n);
  for (const [c, a, k, n] of rows) {
    add(s.cat, k, n);
    if (c) add(s.cityCat, `${c}:${k}`, n);
    if (a) add(s.areaCat, `${a}:${k}`, n);
    if (tops.has(k)) {
      s.total += n;
      if (c) add(s.city, c, n);
      if (a) {
        add(s.area, a, n);
        if (c) {
          if (!s.cityAreas.has(c)) s.cityAreas.set(c, new Map());
          add(s.cityAreas.get(c)!, a, n);
        }
      }
    }
  }
  return s;
}

async function compute(): Promise<ScopeCounts> {
  await dbConnect();
  const stats = mongoose.connection.db!.collection<{ _id: string; [k: string]: any }>("app_stats");
  const snap = await stats.findOne({ _id: SNAPSHOT_ID });
  const force = !!state.force;
  state.force = false;
  if (!force && snap && Date.now() - snap.at < TTL_MS) return build(snap.rows, snap.tops, snap.at);

  // Stale or missing: take the lease, or let the process holding it finish.
  const now = Date.now();
  let leased = false;
  try {
    const r = await stats.findOneAndUpdate(
      { _id: LEASE_ID, until: { $lt: now } },
      { $set: { until: now + 150_000, by: `${process.pid}` } },
      { upsert: true, returnDocument: "after" },
    );
    leased = !!r;
  } catch { /* duplicate key = someone else holds a live lease */ }
  if (!leased && snap) {
    // Serve the previous figures and check back shortly.
    return build(snap.rows, snap.tops, Date.now() - TTL_MS + RECHECK_MS);
  }

  try {
    const { rows, tops } = await aggregateRows();
    const at = Date.now();
    await stats.updateOne({ _id: SNAPSHOT_ID }, { $set: { rows, tops, at } }, { upsert: true }).catch((e) =>
      console.error("[counts] snapshot not saved:", e?.message));
    return build(rows, tops, at);
  } finally {
    if (leased) await stats.updateOne({ _id: LEASE_ID }, { $set: { until: 0 } }).catch(() => {});
  }
}

/** Current counts; refreshes in the background when older than TTL. */
export async function getScopeCounts(): Promise<ScopeCounts> {
  const stale = !state.current || Date.now() - state.current.at > TTL_MS;
  if (stale && !state.inflight) {
    state.inflight = compute()
      .then((s) => (state.current = s))
      .catch((e) => { console.error("[counts] refresh failed:", e?.message); if (!state.current) throw e; return state.current; })
      .finally(() => { state.inflight = null; });
  }
  return state.current ?? (await state.inflight!);
}

/** Ads in a place (+ optional category). */
export function countIn(s: ScopeCounts, o: { cityId?: string | null; areaId?: string | null; catId?: string | null }): number {
  const { cityId, areaId, catId } = o;
  if (areaId) return catId ? s.areaCat.get(`${areaId}:${catId}`) || 0 : s.area.get(areaId) || 0;
  if (cityId) return catId ? s.cityCat.get(`${cityId}:${catId}`) || 0 : s.city.get(cityId) || 0;
  return catId ? s.cat.get(catId) || 0 : s.total;
}

/**
 * Force a refresh soon (e.g. after bulk moderation) — next reader triggers it.
 * The shared snapshot is aged too: otherwise the refresh (here and in every
 * other process) would just re-read a snapshot taken before the change.
 */
export function markCountsStale() {
  if (state.current) state.current = { ...state.current, at: 0 };
  state.force = true;
  void dbConnect()
    .then(() => mongoose.connection.db!.collection<{ _id: string }>("app_stats").updateOne({ _id: SNAPSHOT_ID }, { $set: { at: 0 } }))
    .catch(() => {});
}

/** Re-aggregate now and wait for it (after bulk writes such as first-run setup). */
export async function refreshScopeCounts(): Promise<void> {
  if (state.inflight) await state.inflight.catch(() => {});
  state.force = true;
  state.current = await compute();
}

/**
 * Apply one ad going live (+1) or leaving (-1) to the snapshot right away, so
 * a seller who just posted sees their ad counted on its archive immediately
 * rather than after the next refresh (which then replaces this estimate with
 * the exact figure). Called by the Listing model on save.
 */
export function adjustScopeCounts(
  doc: { allCategoryIds?: unknown[]; locationRefs?: { cityId?: unknown; areaId?: unknown } | null },
  delta: 1 | -1
) {
  const s = state.current;
  if (!s) return;
  const bump = (m: Map<string, number>, k: string) => m.set(k, Math.max(0, (m.get(k) || 0) + delta));
  const c = doc.locationRefs?.cityId ? String(doc.locationRefs.cityId) : "";
  const a = doc.locationRefs?.areaId ? String(doc.locationRefs.areaId) : "";
  const cats = (doc.allCategoryIds || []).map(String);
  for (const k of cats) {
    bump(s.cat, k);
    if (c) bump(s.cityCat, `${c}:${k}`);
    if (a) bump(s.areaCat, `${a}:${k}`);
  }
  if (!cats.some((k) => state.tops.has(k))) return;
  s.total = Math.max(0, s.total + delta);
  if (c) bump(s.city, c);
  if (a) {
    bump(s.area, a);
    if (c) {
      if (!s.cityAreas.has(c)) s.cityAreas.set(c, new Map());
      bump(s.cityAreas.get(c)!, a);
    }
  }
}
// The model can't import this module (it imports the model), so it calls
// through this process-wide hook.
g.__listingScopeDelta = adjustScopeCounts;
