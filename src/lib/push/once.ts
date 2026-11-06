/**
 * "Only once" guard for pushes that must not repeat: one price-drop alert per
 * ad per day, one "saved your ad" push per ad every few hours, each views
 * milestone once, one boost reminder per boost. Backed by a tiny collection
 * with a unique key and a TTL index, so it works across every app process.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";

const g = globalThis as unknown as { __pushOnceIndexed?: boolean };

/** True the first time `key` is claimed within `hours`; false after that. */
export async function once(key: string, hours: number): Promise<boolean> {
  await dbConnect();
  const coll = mongoose.connection.db!.collection<{ _id: string; exp: Date }>("push_once");
  if (!g.__pushOnceIndexed) {
    g.__pushOnceIndexed = true;
    coll.createIndex({ exp: 1 }, { expireAfterSeconds: 0 }).catch(() => { g.__pushOnceIndexed = false; });
  }
  try {
    await coll.insertOne({ _id: key, exp: new Date(Date.now() + hours * 3_600_000) });
    return true;
  } catch (e: any) {
    if (e?.code !== 11000) throw e;
    // Expired but not yet swept by the TTL monitor: claim it again.
    const r = await coll.updateOne({ _id: key, exp: { $lt: new Date() } }, { $set: { exp: new Date(Date.now() + hours * 3_600_000) } });
    return r.modifiedCount === 1;
  }
}
