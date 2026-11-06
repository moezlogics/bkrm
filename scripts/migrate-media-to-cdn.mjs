#!/usr/bin/env node
/**
 * Move media-library files stored on this server (storage/media) to the site's
 * CDN (./cdn), and rewrite every reference to them (listings, users, settings,
 * pages…). Use it when files were saved locally — in development, or before
 * MEDIA_DRIVER=cdn was switched on — and should now live on the CDN.
 *
 *   node scripts/migrate-media-to-cdn.mjs --dry-run       # report only
 *   node scripts/migrate-media-to-cdn.mjs                 # migrate
 *   node scripts/migrate-media-to-cdn.mjs --no-ai         # …without AI alt text (large imports)
 *   node scripts/migrate-media-to-cdn.mjs --delete-local  # …and remove the local copies
 *
 * Reads MONGODB_URI, CDN_URL, CDN_API_KEY (and MEDIA_DIR) from the environment,
 * else from .env.local. Safe to re-run: only files still on the local driver move.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = fs.existsSync(path.join(ROOT, ".env.local"))
  ? Object.fromEntries(
      fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
    )
  : {};
const env = (k) => process.env[k] || fileEnv[k] || "";
const DRY = process.argv.includes("--dry-run");
const DELETE_LOCAL = process.argv.includes("--delete-local");
const NO_AI = process.argv.includes("--no-ai");
const CDN = env("CDN_URL").replace(/\/+$/, "");
const KEY = env("CDN_API_KEY");
const MEDIA_DIR = path.resolve(env("MEDIA_DIR") || path.join(ROOT, "storage", "media"));
if (!CDN || !KEY) { console.error("Set CDN_URL and CDN_API_KEY (environment or .env.local) first."); process.exit(1); }

// Where a media URL can appear: [collection, field, kind] — kind: value | array | html
const REFS = [
  ["listings", "mainImage", "value"], ["listings", "galleryImages", "array"],
  ["settings", "value", "value"],
  ["users", "profileImage", "value"], ["users", "shopLogo", "value"], ["users", "shopBanner", "value"],
  ["users", "cnicImage", "value"], ["users", "selfieImage", "value"],
  ["users", "verificationDoc.frontImage", "value"], ["users", "verificationDoc.backImage", "value"], ["users", "verificationDoc.selfieImage", "value"],
  ["sliders", "image", "value"], ["blogposts", "coverImage", "value"], ["categories", "image", "value"], ["categories", "icon", "value"],
  ["cities", "image", "value"], ["cities", "featuredImage", "value"], ["notifications", "image", "value"], ["invoices", "paymentScreenshot", "value"],
  ["blogposts", "content", "html"], ["cmspages", "content", "html"], ["categories", "content", "html"], ["cities", "content", "html"],
];

async function replaceEverywhere(db, from, to) {
  let n = 0;
  if (!from || from === to) return 0;
  for (const [coll, field, kind] of REFS) {
    const c = db.collection(coll);
    if (kind === "value") {
      if (DRY) n += await c.countDocuments({ [field]: from });
      else n += (await c.updateMany({ [field]: from }, { $set: { [field]: to } })).modifiedCount;
    } else if (kind === "array") {
      if (DRY) n += await c.countDocuments({ [field]: from });
      else n += (await c.updateMany({ [field]: from }, { $set: { [`${field}.$[e]`]: to } }, { arrayFilters: [{ e: from }] })).modifiedCount;
    } else {
      const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const docs = await c.find({ [field]: { $regex: esc } }).project({ [field]: 1 }).toArray();
      n += docs.length;
      if (!DRY) for (const d of docs) await c.updateOne({ _id: d._id }, { $set: { [field]: String(d[field]).split(from).join(to) } });
    }
  }
  return n;
}

async function upload(buf, name, m) {
  const fd = new FormData();
  fd.append("files", new Blob([buf], { type: "image/webp" }), name);
  fd.append("folder", m.folder || "general");
  if (m.isPrivate) fd.append("private", "1");
  if (m.alt || m.title) fd.append("context", String(m.alt || m.title).slice(0, 200));
  fd.append("ai", NO_AI || m.altSource === "user" ? "off" : "async");
  const r = await fetch(`${CDN}/api/media/upload`, { method: "POST", headers: { "x-cdn-key": KEY }, body: fd });
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error || `CDN ${r.status}`);
  return j.data;
}

await mongoose.connect(env("MONGODB_URI") || "mongodb://127.0.0.1:27017/marketplace");
const db = mongoose.connection.db;
const health = await fetch(`${CDN}/health`).then((r) => r.json()).catch(() => null);
if (!health?.status) { console.error(`CDN not reachable at ${CDN}`); process.exit(1); }

const docs = await db.collection("media").find({ $or: [{ driver: "local" }, { driver: { $exists: false } }] }).toArray();
console.log(`${DRY ? "[dry run] " : ""}${docs.length} local file(s) to move to ${CDN}`);
let moved = 0, refs = 0, missing = 0, failed = 0;

for (const [i, m] of docs.entries()) {
  const abs = path.join(MEDIA_DIR, ...String(m.key).split("/"));
  if (!fs.existsSync(abs)) { missing++; console.warn(`  missing on disk: ${m.key}`); continue; }
  try {
    const newUrl = m.isPrivate ? m.url.replace(/\/media\/.*$/, `/media/p/${m._id}`) : null;
    if (DRY) {
      const n = (await replaceEverywhere(db, m.url, "x")) + (await replaceEverywhere(db, m.thumbUrl, "x"));
      refs += n; moved++;
      continue;
    }
    const item = await upload(fs.readFileSync(abs), m.originalName || path.basename(abs), m);
    const url = newUrl || item.url;
    const thumbUrl = newUrl || item.thumbUrl || item.url;
    const n = (await replaceEverywhere(db, m.url, url)) + (await replaceEverywhere(db, m.thumbUrl, thumbUrl));
    await db.collection("media").updateOne({ _id: m._id }, { $set: {
      url, thumbUrl, key: item.key, driver: "cdn", mime: item.mime, kind: item.kind || "image",
      width: item.width || m.width, height: item.height || m.height, sizeBytes: item.sizeBytes,
      placeholder: item.placeholder || "", color: item.color || "", aiStatus: item.ai || "skipped",
    } });
    if (DELETE_LOCAL) {
      fs.rmSync(abs, { force: true });
      fs.rmSync(abs.replace(/\.webp$/, "-thumb.webp"), { force: true });
    }
    moved++; refs += n;
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${docs.length} moved`);
  } catch (e) {
    failed++;
    console.error(`  FAILED ${m.key}: ${e.message}`);
  }
}

console.log(`\n${DRY ? "[dry run] " : ""}moved ${moved}, references ${refs}, missing ${missing}, failed ${failed}`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
