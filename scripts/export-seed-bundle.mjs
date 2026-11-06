#!/usr/bin/env node
/**
 * Export this site into seed/bundle.json for a new server. /setup loads the
 * bundle into the empty database and then deletes it.
 *
 *   node scripts/export-seed-bundle.mjs                   # structure only
 *   node scripts/export-seed-bundle.mjs --with-content    # + sellers, ads and their photos
 *
 * Structure: categories (makes/models), spec fields and options, countries /
 * states / cities / areas, pages, FAQs, blog posts, report reasons, plans,
 * home rails and non-secret settings.
 *
 * --with-content adds the sellers (never admins), their ads, plans, reviews,
 * sliders and media. Every photo stored on this machine is uploaded through
 * the site's own CDN service (./cdn, started by this script) into
 * cdn/data — deploy that folder with the CDN and the photos are already there.
 * In the bundle their URLs read "{{CDN}}/u/…"; setup swaps in the live
 * NEXT_PUBLIC_CDN_URL.
 *
 * Options:
 *   --keep-passwords              keep the sellers' passwords (default: random —
 *                                 they use "Forgot password" on the new server)
 *   --drop-category <path>        leave a category (and everything under it) out
 *   --rename-category "<path>=<Name>"
 *
 * Never exported: admins, chats, offers, payments/invoices, push data, login
 * records, and settings that hold secrets, local URLs, tracking code or contact
 * details. Reads MONGODB_URI (and the CDN settings) from the environment, else .env.local.
 */
import fs from "fs";
import path from "path";
import net from "net";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = fs.existsSync(path.join(ROOT, ".env.local"))
  ? Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]))
  : {};
const env = (k) => process.env[k] || fileEnv[k] || "";
const URI = env("MONGODB_URI");
if (!URI) { console.error("MONGODB_URI is not set."); process.exit(1); }
const OUT = path.join(ROOT, "seed", "bundle.json");
const MEDIA_DIR = path.resolve(env("MEDIA_DIR") || path.join(ROOT, "storage", "media"));
const CDN_DIR = path.join(ROOT, "cdn");
const CDN_DATA = path.join(CDN_DIR, "data");
const TOKEN = "{{CDN}}";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const listArg = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const WITH_CONTENT = has("--with-content");
const KEEP_PASSWORDS = has("--keep-passwords");
const drop = new Set(listArg("--drop-category"));
const rename = new Map(listArg("--rename-category").map((s) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]));

const STRUCTURE = ["categories", "customfields", "countries", "states", "cities", "areas", "cmspages", "faqs", "blogposts", "reportreasons", "packages", "featuresections", "settings"];
const CONTENT = ["users", "listings", "media", "userpurchasedpackages", "reviews", "sliders"];
// Settings that must never travel: secrets, per-install state, contact details
// (asked at setup), tracking code, payment accounts.
const SKIP_SETTING = /secret|key|token|webhook|smtp|pass|vapid|private|^setup_done$|^contact_|^whatsapp_number$|^head_code$|^body_code$|^payment_methods$|^push_/i;
const LOCAL_URL = /localhost|127\.0\.0\.1|\[::1\]/i;

await mongoose.connect(URI);
const db = mongoose.connection.db;
const { EJSON } = mongoose.mongo.BSON;
const bundle = { version: 2, exportedAt: new Date().toISOString(), collections: {} };

// ───────────── structure ─────────────
for (const name of STRUCTURE) {
  let docs = await db.collection(name).find({}).toArray();
  if (name === "categories") {
    const gone = new Set(docs.filter((d) => drop.has(d.path)).map((d) => String(d._id)));
    let grew = true;
    while (grew) { grew = false; for (const d of docs) if (!gone.has(String(d._id)) && d.parentCategoryId && gone.has(String(d.parentCategoryId))) { gone.add(String(d._id)); grew = true; } }
    docs = docs.filter((d) => !gone.has(String(d._id)));
    for (const d of docs) if (rename.has(d.path)) d.name = rename.get(d.path);
  }
  if (name === "cities" || name === "areas") for (const d of docs) d.listingCount = 0;
  if (name === "settings") docs = docs.filter((d) => !SKIP_SETTING.test(d.key));
  bundle.collections[name] = docs;
}

// ───────────── content (+ photos into cdn/data) ─────────────
const urlMap = new Map(); // old URL → new URL
if (WITH_CONTENT) {
  const users =(await db.collection("users").find({ role: { $ne: "admin" }, isDemo: { $ne: true } }).toArray());
  const userIds = new Set(users.map((u) => String(u._id)));
  for (const u of users) {
    delete u.lastLoginIp;
    if (!KEEP_PASSWORDS) u.password = `!${randomBytes(24).toString("hex")}`; // no hash matches → nobody can sign in with it
  }
  const listings = (await db.collection("listings").find({ isDemo: { $ne: true } }).toArray()).filter((l) => userIds.has(String(l.userId)));
  // Listings in a dropped category move up to the nearest category that stays.
  const catIds = new Set(bundle.collections.categories.map((c) => String(c._id)));
  const allCats = new Map((await db.collection("categories").find({}).project({ parentCategoryId: 1 }).toArray()).map((c) => [String(c._id), c]));
  for (const l of listings) {
    l.allCategoryIds = (l.allCategoryIds || []).filter((id) => catIds.has(String(id)));
    let cid = String(l.categoryId);
    while (cid && !catIds.has(cid)) cid = allCats.get(cid)?.parentCategoryId ? String(allCats.get(cid).parentCategoryId) : "";
    if (cid) l.categoryId = new mongoose.Types.ObjectId(cid);
  }
  const listingIds = new Set(listings.map((l) => String(l._id)));
  const plans = (await db.collection("userpurchasedpackages").find({}).toArray()).filter((p) => userIds.has(String(p.userId)));
  for (const p of plans) p.invoiceId = null;
  const reviews = (await db.collection("reviews").find({}).toArray()).filter((r) => (!r.listingId || listingIds.has(String(r.listingId))));
  const sliders = await db.collection("sliders").find({}).toArray();

  // Media worth taking: uploaded by an exported seller, or referenced anywhere we export.
  const text = EJSON.stringify({ ...bundle.collections, users, listings, sliders });
  const media = (await db.collection("media").find({}).toArray())
    .filter((m) => userIds.has(String(m.uploadedBy)) || text.includes(m.url));

  const local = media.filter((m) => m.driver !== "cdn");
  const onCdn = media.filter((m) => m.driver === "cdn");
  const cdnUrl = env("NEXT_PUBLIC_CDN_URL") || env("CDN_PUBLIC_URL") || env("CDN_URL");
  let uploaded = 0, missing = 0, kept = 0;

  // Photos already on a CDN that lives in ./cdn/data (local development CDN): just re-point them.
  for (const m of onCdn) {
    if (cdnUrl && m.url.startsWith(`${cdnUrl.replace(/\/+$/, "")}/u/`)) {
      const rel = m.url.slice(cdnUrl.replace(/\/+$/, "").length + 3);
      if (fs.existsSync(path.join(CDN_DATA, "public", ...rel.split("/")))) {
        const to = (u) => (u || "").replace(cdnUrl.replace(/\/+$/, ""), TOKEN);
        urlMap.set(m.url, to(m.url)); if (m.thumbUrl) urlMap.set(m.thumbUrl, to(m.thumbUrl));
        kept++;
        continue;
      }
    }
    if (LOCAL_URL.test(m.url)) { missing++; m._drop = true; } // a local CDN whose files aren't in ./cdn/data
  }

  if (local.length) {
    const cdn = await startCdn();
    try {
      for (const [i, m] of local.entries()) {
        const abs = path.join(MEDIA_DIR, ...String(m.key).split("/"));
        if (!fs.existsSync(abs)) { missing++; m._drop = true; continue; }
        const fd = new FormData();
        fd.append("files", new Blob([fs.readFileSync(abs)], { type: m.mime || "image/webp" }), m.originalName || path.basename(abs));
        fd.append("folder", m.folder || "general");
        if (m.isPrivate) fd.append("private", "1");
        if (m.alt || m.title) fd.append("context", String(m.alt || m.title).slice(0, 200));
        fd.append("ai", "off");
        const r = await fetch(`${cdn.url}/api/media/upload`, { method: "POST", headers: { "x-cdn-key": cdn.key }, body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(`CDN upload failed for ${m.key}: ${j.error || r.status}`);
        const it = j.data;
        const base = m.url.slice(0, m.url.indexOf("/media/")); // the site's base path, e.g. /marketplace
        const url = m.isPrivate ? `${base}/media/p/${m._id}` : it.url.replace(cdn.publicUrl, TOKEN);
        const thumbUrl = m.isPrivate ? url : (it.thumbUrl || it.url).replace(cdn.publicUrl, TOKEN);
        urlMap.set(m.url, url); if (m.thumbUrl) urlMap.set(m.thumbUrl, thumbUrl);
        Object.assign(m, { url, thumbUrl, key: it.key, driver: "cdn", mime: it.mime || m.mime, width: it.width || m.width, height: it.height || m.height,
          sizeBytes: it.sizeBytes || m.sizeBytes, placeholder: it.placeholder || m.placeholder || "", color: it.color || m.color || "", aiStatus: "skipped" });
        uploaded++;
        if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${local.length} photos → cdn/data`);
      }
    } finally {
      cdn.stop();
    }
    fs.rmSync(path.join(CDN_DATA, "cache"), { recursive: true, force: true }); // resized variants are rebuilt on demand
  }

  bundle.collections.users = users;
  bundle.collections.listings = listings;
  bundle.collections.media = media.filter((m) => !m._drop);
  bundle.collections.userpurchasedpackages = plans;
  bundle.collections.reviews = reviews;
  bundle.collections.sliders = sliders;
  console.log(`photos: ${uploaded} uploaded into cdn/data, ${kept} already there, ${missing} missing on disk (left out)`);
}

// ───────────── rewrite URLs, drop anything still local ─────────────
// A file in this machine's media library that didn't make it into cdn/data.
const LEFT_BEHIND = /^(\/[a-z0-9-]+)?\/media\/(?!p\/)[^\s"'<>]+\.webp$/i;
const rewrite = (v) => {
  if (typeof v === "string") {
    if (urlMap.has(v)) return urlMap.get(v);
    let s = v;
    if (s.includes("/media/")) for (const [from, to] of urlMap) if (s.includes(from)) s = s.split(from).join(to);
    return LOCAL_URL.test(s) || LEFT_BEHIND.test(s) ? null : s;
  }
  if (Array.isArray(v)) return v.map(rewrite).filter((x) => x !== null);
  if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof mongoose.Types.ObjectId) && v._bsontype === undefined) {
    for (const k of Object.keys(v)) v[k] = rewrite(v[k]);
  }
  return v;
};
for (const [name, docs] of Object.entries(bundle.collections)) {
  bundle.collections[name] = docs.map((d) => rewrite(d));
  if (name === "listings") {
    for (const l of bundle.collections[name]) if (!l.mainImage && l.galleryImages?.length) l.mainImage = l.galleryImages[0];
    bundle.collections[name] = bundle.collections[name].filter((l) => l.mainImage);
  }
  if (name === "sliders") bundle.collections[name] = bundle.collections[name].filter((s) => s.image);
  if (name === "settings") bundle.collections[name] = bundle.collections[name].filter((s) => s.value !== null);
}
bundle.siteName = bundle.collections.settings.find((s) => s.key === "site_name")?.value || null;
bundle.counts = Object.fromEntries(Object.entries(bundle.collections).map(([k, v]) => [k, v.length]));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, EJSON.stringify(bundle, { relaxed: false }));
console.log(`seed/bundle.json written (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB) — ${Object.entries(bundle.counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
if (WITH_CONTENT) console.log("Deploy the cdn folder WITH its data/ directory, and set NEXT_PUBLIC_CDN_URL on the site before /setup.");
await mongoose.disconnect();
process.exit(0);

// ───────────── the site's CDN, started just for the upload ─────────────
async function startCdn() {
  const entry = path.join(CDN_DIR, "dist", "index.js");
  if (!fs.existsSync(entry)) throw new Error("cdn/dist is missing — run `npm ci && npm run build` in the cdn folder first.");
  const port = await new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  const key = randomBytes(24).toString("hex");
  const publicUrl = "https://cdn.export.invalid";
  const child = spawn(process.execPath, [entry], {
    cwd: CDN_DIR,
    env: { ...process.env, NODE_ENV: "development", PORT: String(port), DATA_DIR: CDN_DATA, CDN_API_KEYS: key,
      CDN_SIGNING_SECRET: randomBytes(24).toString("hex"), CDN_PUBLIC_URL: publicUrl, AI_ENABLED: "false", OPENAI_API_KEY: "", WEBHOOK_URL: "" },
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${url}/health`).then((r) => r.ok).catch(() => false);
    if (ok) return { url, key, publicUrl, stop: () => child.kill() };
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error("The CDN didn't start (cdn/dist/index.js).");
}
