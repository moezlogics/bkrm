#!/usr/bin/env node
/**
 * Copy every image that still lives on another site (OLX imports, Unsplash
 * demo photos…) into the site's CDN, and point the ads at the copies.
 *
 * Why: the CDN is the site's storage. Hot-linked photos break whenever the
 * other site says no — OLX refuses requests from datacenter servers, so on the
 * live site those photos didn't show at all, while they did on a PC at home.
 *
 * Each photo is stored under an SEO name — the ad's title, its id and the
 * photo number, e.g.  toyota-corolla-altis-2021-zh4ba0-1-k3j9x0qa.webp  — and
 * gets a media-library entry. Safe to re-run: finished photos are remembered
 * in the `image_imports` collection, and a photo shared by several ads is
 * copied once.
 *
 *   node scripts/import-external-images.mjs --dry-run            # count only
 *   node scripts/import-external-images.mjs                      # import
 *   node scripts/import-external-images.mjs --env .env.live      # another env file
 *   options: --limit 50  --concurrency 4  --ai (AI alt text; off by default)
 *            --drop-missing (remove photos the other site no longer has)
 *
 * Env: MONGODB_URI, CDN_URL (+ CDN_API_KEY), NEXT_PUBLIC_CDN_URL.
 *
 * RUN IT FROM A NORMAL (HOME/OFFICE) CONNECTION, not on the server: OLX blocks
 * datacenter IPs, which is the reason for this script. To import into the
 * live site from your PC, open an SSH tunnel to the server's MongoDB and use
 * an env file with the live values:
 *   ssh -N -L 27018:127.0.0.1:27017 <user>@<server>
 *   .env.live:  MONGODB_URI=mongodb://<user>:<pass>@127.0.0.1:27018/classifieds?authSource=classifieds
 *               CDN_URL=https://cdn.example.com   NEXT_PUBLIC_CDN_URL=https://cdn.example.com
 *               CDN_API_KEY=<the live CDN key>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const envFile = path.resolve(ROOT, arg("--env", ".env.local"));
if (!fs.existsSync(envFile)) { console.error(`Env file not found: ${envFile}`); process.exit(1); }
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);

const DRY = process.argv.includes("--dry-run");
const DROP_MISSING = process.argv.includes("--drop-missing");
const AI = process.argv.includes("--ai") ? "async" : "off";
const LIMIT = Number(arg("--limit", "0")) || Infinity;
const CONCURRENCY = Math.max(1, Math.min(8, Number(arg("--concurrency", "4")) || 4));
const CDN = (env.CDN_URL || env.CDN_BASE_URL || "").replace(/\/+$/, "");
const PUBLIC_CDN = (env.NEXT_PUBLIC_CDN_URL || CDN).replace(/\/+$/, "");
const KEY = env.CDN_API_KEY || "";
if (!env.MONGODB_URI || !CDN || !KEY) { console.error(`Set MONGODB_URI, CDN_URL and CDN_API_KEY in ${path.basename(envFile)}.`); process.exit(1); }

// Profile photos from Google / Facebook sign-in stay where they are.
const KEEP_HOSTS = /(^|\.)(googleusercontent\.com|facebook\.com|fbcdn\.net|fbsbx\.com)$/i;
const ours = (u) => !u || !/^https?:\/\//i.test(u) || u.startsWith(`${PUBLIC_CDN}/`) || u.startsWith(`${CDN}/`);
const external = (u) => {
  if (typeof u !== "string" || ours(u)) return false;
  try { return !KEEP_HOSTS.test(new URL(u).hostname); } catch { return false; }
};
const slug = (s, max) => String(s || "").toLowerCase().normalize("NFKD").replace(/\p{M}+/gu, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Download with retries. Returns { buf, type } | { missing: true } | { refused: true } | throws. */
async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(25_000) });
      if (r.status === 404 || r.status === 410) return { missing: true };
      // OLX answers 403 for a photo it has deleted — and for a connection it blocks.
      if (r.status === 403) return { refused: true };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const type = (r.headers.get("content-type") || "").split(";")[0].trim();
      if (!/^image\//.test(type)) throw new Error(`not an image (${type || "no type"})`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 200) throw new Error("empty image");
      if (buf.length > 15 * 1024 * 1024) throw new Error("image over 15 MB");
      return { buf, type };
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(800 * attempt);
    }
  }
}

async function upload(buf, type, name, context) {
  const fd = new FormData();
  fd.append("files", new Blob([buf], { type }), name);
  fd.append("folder", "listings");
  if (context) fd.append("context", String(context).slice(0, 200));
  fd.append("ai", AI);
  const r = await fetch(`${CDN}/api/media/upload`, { method: "POST", headers: { "x-cdn-key": KEY }, body: fd, signal: AbortSignal.timeout(90_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || `CDN ${r.status}`);
  const it = (j.items && j.items[0]) || j.data;
  if (!it?.url) throw new Error(j.failed?.[0]?.error || "CDN returned no file");
  return it;
}

await mongoose.connect(env.MONGODB_URI);
const db = mongoose.connection.db;
const health = await fetch(`${CDN}/health`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null);
if (!health?.status) { console.error(`CDN not reachable at ${CDN}`); process.exit(1); }

const imports = db.collection("image_imports"); // { _id: source URL, url, key, status: "done" | "missing" }
const done = new Map((await imports.find({}).toArray()).map((d) => [d._id, d]));
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
// Hosts that have served us photos: a 403 from them means that photo is gone,
// not that we're blocked.
const hostOk = new Set([...done.values()].filter((d) => d.status === "done").map((d) => hostOf(d._id)));

/** Copy one source URL (once, however many ads use it). */
const inflight = new Map();
function importOne(src, name, context, owner) {
  if (done.has(src)) return Promise.resolve(done.get(src));
  if (inflight.has(src)) return inflight.get(src);
  const p = (async () => {
    const got = await download(src);
    if (got.refused && !hostOk.has(hostOf(src))) {
      throw new Error("refused (HTTP 403). If every photo fails like this, the site is blocking this connection — run the script from a home/office PC, not the server");
    }
    if (got.missing || got.refused) {
      const rec = { _id: src, status: "missing", at: new Date() };
      if (!DRY) await imports.updateOne({ _id: src }, { $set: rec }, { upsert: true });
      done.set(src, rec);
      return rec;
    }
    hostOk.add(hostOf(src));
    const ext = got.type === "image/png" ? ".png" : got.type === "image/webp" ? ".webp" : ".jpg";
    const it = await upload(got.buf, got.type, `${name}${ext}`, context);
    const now = new Date();
    await db.collection("media").insertOne({
      url: it.url, thumbUrl: it.thumbUrl || it.url, key: it.key, driver: "cdn", mime: it.mime || "image/webp", kind: "image",
      width: it.width || 0, height: it.height || 0, sizeBytes: it.sizeBytes || got.buf.length,
      originalName: path.basename(new URL(src).pathname).slice(0, 200), title: context || name,
      alt: it.alt || context || "", altSource: it.alt ? "ai" : "auto", caption: "", aiStatus: it.ai || "skipped",
      placeholder: it.placeholder || "", color: it.color || "", folder: "listings", isPrivate: false,
      uploadedBy: owner, importedFrom: src, createdAt: now, updatedAt: now,
    });
    const rec = { _id: src, status: "done", url: it.url, key: it.key, at: now };
    await imports.updateOne({ _id: src }, { $set: rec }, { upsert: true });
    done.set(src, rec);
    return rec;
  })().finally(() => inflight.delete(src));
  inflight.set(src, p);
  return p;
}

// ── Listings ──
const filter = { $or: [{ mainImage: { $regex: "^https?://" } }, { galleryImages: { $elemMatch: { $regex: "^https?://" } } }] };
const candidates = await db.collection("listings").find(filter).project({ name: 1, slug: 1, userId: 1, mainImage: 1, galleryImages: 1 }).toArray();
const todo = candidates.filter((l) => external(l.mainImage) || (l.galleryImages || []).some(external)).slice(0, LIMIT);
const photoCount = todo.reduce((n, l) => n + new Set([l.mainImage, ...(l.galleryImages || [])].filter(external)).size, 0);
console.log(`${DRY ? "[dry run] " : ""}${todo.length} ad(s) with ${photoCount} photo(s) on other sites → ${PUBLIC_CDN}`);
if (DRY) {
  const hosts = {};
  for (const l of todo) for (const u of [l.mainImage, ...(l.galleryImages || [])].filter(external)) { const h = new URL(u).hostname; hosts[h] = (hosts[h] || 0) + 1; }
  console.log(hosts);
  await mongoose.disconnect();
} else {

let adsDone = 0, copied = 0, missing = 0, failed = 0;
async function processListing(l) {
  // The id at the end of the ad's own address (…-zh4ba0), so photo and ad match.
  const idShort = String(l.slug || "").match(/-([a-z0-9]{5,8})$/)?.[1] || String(l._id).slice(-6);
  const base = `${slug(l.name, 44) || "photo"}-${idShort}`;
  const gallery = (l.galleryImages || []).length ? [...l.galleryImages] : l.mainImage ? [l.mainImage] : [];
  const mapped = [];
  let changed = false;
  for (const [i, src] of gallery.entries()) {
    if (!external(src)) { mapped.push(src); continue; }
    try {
      const rec = await importOne(src, `${base}-${i + 1}`, l.name, l.userId);
      if (rec.status === "done") { mapped.push(rec.url); changed = true; copied++; }
      else { missing++; if (DROP_MISSING) changed = true; else mapped.push(src); }
    } catch (e) {
      failed++; mapped.push(src);
      console.error(`  FAILED ${l.slug} photo ${i + 1}: ${e.message}`);
    }
  }
  // The cover: usually the first photo (copied above); a separate cover image
  // is copied on its own. A cover the other site no longer has gives way to
  // the first photo that made it.
  let main = l.mainImage;
  if (external(main)) {
    let rec = done.get(main);
    if (!rec) {
      try { rec = await importOne(main, `${base}-cover`, l.name, l.userId); }
      catch (e) { failed++; console.error(`  FAILED ${l.slug} cover: ${e.message}`); }
    }
    if (rec?.status === "done") main = rec.url;
    else if (rec?.status === "missing") {
      if (!gallery.includes(l.mainImage)) missing++;
      main = mapped.find((u) => !external(u)) || (DROP_MISSING ? null : main);
    }
    if (main !== l.mainImage) changed = true;
  }
  if (changed) {
    await db.collection("listings").updateOne({ _id: l._id }, { $set: { mainImage: main || null, galleryImages: mapped } });
    adsDone++;
    console.log(`  ${l.slug}: ${mapped.filter((u) => !external(u)).length}/${gallery.length} photos on the CDN`);
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) await processListing(queue.shift());
}));

console.log(`\nads updated ${adsDone}, photos copied ${copied}, gone from the other site ${missing}${DROP_MISSING ? " (removed)" : " (kept — use --drop-missing to remove)"}, failed ${failed}`);
if (failed) console.log("Re-run to retry the failed ones — finished photos are skipped.");
await mongoose.disconnect();
// (No process.exit(): on Windows it can abort while sockets are still closing.)
process.exitCode = failed ? 1 : 0;
}
