#!/usr/bin/env node
/**
 * Fill / rebuild every listing's search keywords (`kw`) and make sure the
 * scale indexes exist. New and edited ads get `kw` automatically (Listing
 * pre-save hook); run this once after deploying, and again after renaming
 * categories in bulk.
 *
 *   node scripts/reindex-keywords.mjs                  # all listings
 *   node scripts/reindex-keywords.mjs --missing        # only ads without kw
 *   node scripts/reindex-keywords.mjs --drop-text-index  # also drop the unused $text index
 *
 * Reads MONGODB_URI from the environment or .env.local. Safe to re-run.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { listingKeywords } from "../src/lib/keywords-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env.local");
const env = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs.readFileSync(envFile, "utf8").split(/\r?\n/)
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
    )
  : {};
const URI = process.env.MONGODB_URI || env.MONGODB_URI;
if (!URI) { console.error("MONGODB_URI is not set."); process.exit(1); }
const ONLY_MISSING = process.argv.includes("--missing");
const DROP_TEXT = process.argv.includes("--drop-text-index");
const BATCH = 1000;

await mongoose.connect(URI);
const db = mongoose.connection.db;
const L = db.collection("listings");

const names = new Map((await db.collection("categories").find({}, { projection: { name: 1 } }).toArray()).map((c) => [String(c._id), c.name]));
const filter = ONLY_MISSING ? { kw: { $exists: false } } : {};
const total = await L.countDocuments(filter);
console.log(`Re-indexing ${total.toLocaleString()} listings${ONLY_MISSING ? " (missing only)" : ""}…`);

const t0 = Date.now();
let done = 0, ops = [];
const flush = async () => {
  if (!ops.length) return;
  await L.bulkWrite(ops, { ordered: false });
  done += ops.length;
  ops = [];
  if (done % 20000 < BATCH) console.log(`  ${done.toLocaleString()} / ${total.toLocaleString()}  (${Math.round((Date.now() - t0) / 1000)} s)`);
};
const cursor = L.find(filter, { projection: { name: 1, allCategoryIds: 1, categoryId: 1, customFieldValues: 1, condition: 1 } }).batchSize(BATCH);
for await (const d of cursor) {
  const ids = (d.allCategoryIds?.length ? d.allCategoryIds : [d.categoryId]).filter(Boolean).map(String);
  const kw = listingKeywords({ name: d.name, categoryNames: ids.map((i) => names.get(i)).filter(Boolean), specs: d.customFieldValues, condition: d.condition });
  ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { kw } } } });
  if (ops.length >= BATCH) await flush();
}
await flush();
console.log(`Keywords written for ${done.toLocaleString()} listings in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);

// Indexes the app's hot paths rely on (idempotent — existing ones are kept).
const wanted = [
  [{ kw: 1, status: 1, createdAt: -1 }],
  [{ userId: 1, status: 1, createdAt: -1 }],
  [{ createdAt: -1 }],
  [{ status: 1, createdAt: -1 }],
  [{ status: 1, price: 1 }],
  [{ allCategoryIds: 1, status: 1, price: 1 }],
  [{ "locationRefs.cityId": 1, status: 1, price: 1 }],
];
for (const [keys] of wanted) {
  const t = Date.now();
  const name = await L.createIndex(keys);
  console.log(`  index ${name.padEnd(44)} ready (${Date.now() - t} ms)`);
}
if (DROP_TEXT) {
  const text = (await L.indexes()).find((i) => i.key?._fts === "text");
  if (text) { await L.dropIndex(text.name); console.log(`  dropped unused text index ${text.name}`); }
}
await mongoose.disconnect();
