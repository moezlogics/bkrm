/**
 * First-run setup (server-only): turns an empty database into a working
 * marketplace for the active vertical — the owner's admin account, site
 * settings, Pakistan's cities and areas, the category tree (sections → makes →
 * models), spec fields, plans, pages, FAQs, guides, report reasons and home
 * rails — plus, optionally, a handful of clearly-flagged demo ads.
 *
 * Runs once: /setup is only offered while the database has no users, and a
 * unique "setup_done" setting makes a second run impossible even if two
 * requests race. Demo content (isDemo) can be removed later in one go.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Category from "@/models/Category";
import CustomField from "@/models/CustomField";
import Listing from "@/models/Listing";
import Media from "@/models/Media";
import ReportReason from "@/models/ReportReason";
import Package from "@/models/Package";
import Setting from "@/models/Setting";
import Country from "@/models/Country";
import State from "@/models/State";
import City from "@/models/City";
import Area from "@/models/Area";
import CmsPage from "@/models/CmsPage";
import Faq from "@/models/Faq";
import BlogPost from "@/models/BlogPost";
import FeatureSection from "@/models/FeatureSection";
import Favourite from "@/models/Favourite";
import { expireTag } from "@/lib/catalog";
import { invalidateSettings } from "@/lib/settings";
import { markCountsStale, refreshScopeCounts } from "@/lib/scope-counts";
import { seg, modelSeg, modelName } from "@/lib/taxonomy";
import { saveUploads } from "@/lib/media-store";
import { deleteStored } from "@/lib/storage";
import { VERTICAL } from "@/vertical";
import { needsSetup } from "@/lib/setup-state";
import { SEED } from "@/vertical/seed";
import type { SeedDemoAd } from "@/vertical/seed/types";
import locations from "@/vertical/seed/pk-locations.json";

export type SetupInput = {
  siteName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  contactPhone?: string;
  demo: boolean;
};

export class SetupError extends Error {}

const DONE_KEY = "setup_done";

// ───────────────────────── seed bundle ─────────────────────────
// A site exported elsewhere (scripts/export-seed-bundle.mjs): when present,
// setup loads it instead of the built-in catalogue, then deletes it. With
// --with-content it also carries sellers, ads and media whose photos travel in
// the CDN's data folder; their URLs read "{{CDN}}/u/…" until setup fills in
// this server's CDN address.

export const BUNDLE_PATH = process.env.SEED_BUNDLE || path.join(/*turbopackIgnore: true*/ process.cwd(), "seed", "bundle.json");
const STRUCTURE = ["categories", "customfields", "countries", "states", "cities", "areas", "cmspages", "faqs", "blogposts", "reportreasons", "packages", "featuresections", "settings"];
const CONTENT = ["users", "listings", "media", "userpurchasedpackages", "reviews", "sliders"];
const BUNDLE_COLLECTIONS = [...STRUCTURE, ...CONTENT];
const CDN_TOKEN = "{{CDN}}";
type Bundle = { version: number; siteName?: string | null; counts?: Record<string, number>; collections: Record<string, Record<string, unknown>[]> };

/** This server's CDN address (photos in the bundle point at it). */
const cdnBase = () => (process.env.NEXT_PUBLIC_CDN_URL || process.env.CDN_PUBLIC_URL || process.env.CDN_URL || "").replace(/\/+$/, "");

function readBundleText(): string | null {
  try { return fs.readFileSync(BUNDLE_PATH, "utf8"); } catch { return null; }
}

/** The bundle, with its photo URLs pointing at this server's CDN. */
function readBundle(): Bundle | null {
  let text = readBundleText();
  if (!text) return null;
  if (text.includes(CDN_TOKEN)) {
    if (!cdnBase()) throw new SetupError("The seed file has photos on the CDN: set NEXT_PUBLIC_CDN_URL (the CDN's public address) in .env and restart, then run setup.");
    text = text.split(CDN_TOKEN).join(cdnBase());
  }
  try {
    const b = mongoose.mongo.BSON.EJSON.parse(text, { relaxed: false }) as Bundle;
    return b && typeof b.collections === "object" ? b : null;
  } catch {
    throw new SetupError("The seed file (seed/bundle.json) can't be read — export it again.");
  }
}

/** What the setup page shows about a waiting bundle. */
export function bundleSummary(): { siteName: string | null; counts: Record<string, number>; cdnMissing: boolean } | null {
  const text = readBundleText();
  if (!text) return null;
  try {
    const b = mongoose.mongo.BSON.EJSON.parse(text, { relaxed: true }) as Bundle;
    const counts = Object.fromEntries(BUNDLE_COLLECTIONS.map((c) => [c, b.collections?.[c]?.length || 0]));
    return { siteName: b.siteName || null, counts, cdnMissing: text.includes(CDN_TOKEN) && !cdnBase() };
  } catch {
    return null;
  }
}

async function applyBundle(b: Bundle, adminEmail: string) {
  const db = mongoose.connection.db!;
  for (const name of BUNDLE_COLLECTIONS) {
    let docs = b.collections[name];
    if (!Array.isArray(docs) || !docs.length) continue;
    if (name === "settings") {
      await db.collection("settings").bulkWrite(docs.filter((s) => s.key && s.key !== DONE_KEY).map((s) => ({
        updateOne: { filter: { key: s.key }, update: { $set: { value: s.value } }, upsert: true },
      })));
      continue;
    }
    if (name === "users") {
      // The admin was just created from the setup form; a seller with the same email stays out.
      docs = docs.filter((u) => String(u.email || "").toLowerCase() !== adminEmail && u.role !== "admin");
      if (!docs.length) continue;
      await db.collection(name).insertMany(docs as never[], { ordered: false });
      continue;
    }
    // needsSetup() guarantees a fresh site: nothing here belongs to anyone yet.
    await db.collection(name).deleteMany({});
    await db.collection(name).insertMany(docs as never[], { ordered: false });
  }
  // Live-ad counts on the city and area pages.
  if (b.collections.listings?.length) {
    const count = async (field: string) =>
      new Map((await db.collection("listings").aggregate([{ $match: { status: "approved" } }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]).toArray()).map((r) => [String(r._id), r.n]));
    const [byCity, byArea] = await Promise.all([count("locationRefs.cityId"), count("locationRefs.areaId")]);
    for (const [coll, map] of [["cities", byCity], ["areas", byArea]] as const) {
      await db.collection(coll).bulkWrite((await db.collection(coll).find({}).project({ _id: 1 }).toArray()).map((d) => ({
        updateOne: { filter: { _id: d._id }, update: { $set: { listingCount: map.get(String(d._id)) || 0 } } },
      })));
    }
  }
}

/** The bundle has done its job — remove it so it can't be read or replayed. */
function removeBundle() {
  try {
    fs.rmSync(BUNDLE_PATH, { force: true });
    const dir = path.dirname(BUNDLE_PATH);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch (e) {
    console.error("[setup] could not delete the seed bundle — delete it by hand:", BUNDLE_PATH, (e as Error).message);
  }
}

export async function runSetup(input: SetupInput) {
  await dbConnect();
  if (!(await needsSetup())) throw new SetupError("This site is already set up.");
  // Read (and check) the bundle before claiming the setup, so a missing CDN
  // address can be fixed and setup simply run again.
  const bundle = readBundle();

  // Claim the one-time setup. The unique key makes a concurrent second run fail here.
  try {
    await Setting.create({ key: DONE_KEY, value: new Date().toISOString() });
  } catch {
    throw new SetupError("Setup is already running or finished.");
  }

  try {
    await User.create({
      name: input.adminName.trim(),
      email: input.adminEmail.trim().toLowerCase(),
      emailVerified: true,
      password: await bcrypt.hash(input.adminPassword, 12),
      phoneNumber: input.contactPhone?.trim() || undefined,
      role: "admin",
      onboardingCompleted: true,
      country: "Pakistan",
    });

    if (bundle) {
      await applyBundle(bundle, input.adminEmail.trim().toLowerCase());
    } else {
      await seedLocations();
      await seedFields(await seedCategories());
      await seedContent(input.siteName.trim());
    }
    await seedSettings(input);
    let demoAds = 0;
    if (input.demo) demoAds = await seedDemo(await categoriesByPath(), await placesByName());

    for (const tag of ["categories", "locations", "cms", "settings"] as const) expireTag(tag);
    invalidateSettings();
    // A new live database runs without auto-indexing: make sure every index
    // exists before visitors arrive (the map/nearby query fails without one).
    await import("@/lib/ensure-indexes").then((m) => m.ensureIndexes()).catch((e) => console.error("[setup] index check failed:", e?.message));
    // Remember the catalogue's fields as offered, so a field the admin deletes later stays deleted.
    await import("@/lib/catalogue-sync").then((m) => m.syncNewFields()).catch(() => {});
    // Archives, the home page and the sitemap read these counts: have them ready.
    await refreshScopeCounts().catch(() => markCountsStale());
    if (bundle) removeBundle();

    return {
      categories: await Category.countDocuments({}),
      fields: await CustomField.countDocuments({}),
      cities: await City.countDocuments({}),
      listings: await Listing.countDocuments({ isDemo: { $ne: true } }),
      sellers: await User.countDocuments({ role: "user" }),
      demoAds,
      fromBundle: !!bundle,
    };
  } catch (e) {
    // Leave the database clean enough to try again.
    await Promise.all([
      User.deleteMany({}), Category.deleteMany({}), CustomField.deleteMany({}), Listing.deleteMany({}),
      Setting.deleteMany({}), Country.deleteMany({}), State.deleteMany({}), City.deleteMany({}), Area.deleteMany({}),
      CmsPage.deleteMany({}), Faq.deleteMany({}), BlogPost.deleteMany({}), FeatureSection.deleteMany({}),
      ReportReason.deleteMany({}), Package.deleteMany({}),
      ...["media", "userpurchasedpackages", "reviews", "sliders"].map((c) => mongoose.connection.db!.collection(c).deleteMany({})),
    ]).catch(() => {});
    throw e;
  }
}

// ───────────────────────── settings ─────────────────────────

/** What the owner typed wins; the vertical's defaults only fill what a bundle didn't bring. */
async function seedSettings(input: SetupInput) {
  const phone = (input.contactPhone || "").replace(/\D/g, "");
  const typed: Record<string, string> = {
    site_name: input.siteName.trim(),
    contact_email: input.adminEmail.trim().toLowerCase(),
    contact_phone: input.contactPhone?.trim() || "",
    // 03001234567 → 923001234567 (international, digits only)
    whatsapp_number: phone ? (phone.startsWith("0") ? `92${phone.slice(1)}` : phone) : "",
  };
  const defaults: Record<string, string> = {
    site_tagline: VERTICAL.defaults.tagline,
    hero_title: VERTICAL.defaults.heroTitle,
    hero_subtitle: VERTICAL.defaults.heroSubtitle,
    search_placeholder: VERTICAL.defaults.searchPlaceholder,
    brand_color: VERTICAL.defaults.brandColor,
    default_free_ad_quota: "1",
    payment_methods: "[]",
  };
  await Setting.bulkWrite([
    ...Object.entries(typed).map(([key, value]) => ({ updateOne: { filter: { key }, update: { $set: { value } }, upsert: true } })),
    ...Object.entries(defaults).map(([key, value]) => ({ updateOne: { filter: { key }, update: { $setOnInsert: { value } }, upsert: true } })),
  ]);
}

/** Category tree and places as they now stand in the database (bundle or built-in). */
async function categoriesByPath(): Promise<Cats> {
  return new Map((await Category.find({}).lean()).map((c: any) => [c.path, c]));
}
async function placesByName(): Promise<Places> {
  const cities = await City.find({}).lean();
  const byId = new Map(cities.map((c: any) => [String(c._id), c]));
  const area = new Map<string, any>();
  for (const a of (await Area.find({}).lean()) as any[]) {
    const c = byId.get(String(a.cityId));
    if (c) area.set(`${c.name.toLowerCase()}|${a.name.toLowerCase()}`, a);
  }
  return { city: new Map(cities.map((c: any) => [c.name.toLowerCase(), c])), area };
}

// ───────────────────────── locations ─────────────────────────

type Places = { city: Map<string, any>; area: Map<string, any> };

async function seedLocations(): Promise<Places> {
  const base = locations as {
    country: { name: string; slug: string; code: string; currency: string };
    states: { name: string; slug: string; order: number }[];
    cities: { name: string; slug: string; state: string; stateName: string; lat: number; lng: number; order: number; areas: { name: string; slug: string; lat: number; lng: number }[] }[];
  };
  // The vertical's own places on top of the shared list (a bakra mandi needs
  // the livestock districts and the big cattle mandis).
  const extra = SEED.places || {};
  const known = new Set(base.cities.map((c) => c.name.toLowerCase()));
  const loc = {
    country: base.country,
    states: [...base.states, ...(extra.states || []).filter((s) => !base.states.some((b) => b.name === s.name))],
    cities: [
      ...base.cities.map((c) => ({ ...c, areas: [...c.areas, ...((extra.areas || {})[c.name] || []).filter((a) => !c.areas.some((b) => b.slug === a.slug))] })),
      ...(extra.cities || []).filter((c) => !known.has(c.name.toLowerCase())).map((c) => ({ ...c, stateName: c.state, areas: (extra.areas || {})[c.name] || [] })),
    ],
  };
  const country = await Country.create({ ...loc.country, isActive: true, order: 1 });
  const states = new Map<string, any>();
  for (const s of loc.states) states.set(s.name.toLowerCase(), await State.create({ ...s, countryId: country._id }));
  const city = new Map<string, any>();
  const area = new Map<string, any>();
  for (const c of loc.cities) {
    const st = states.get(c.state.toLowerCase()) || states.get(c.stateName.toLowerCase());
    const doc = await City.create({
      name: c.name, slug: c.slug, stateId: st?._id || null, stateName: c.stateName,
      latitude: c.lat, longitude: c.lng, order: c.order, isActive: true, listingCount: 0,
    });
    city.set(c.name.toLowerCase(), doc);
    if (c.areas.length) {
      const docs = await Area.insertMany(c.areas.map((a) => ({
        name: a.name, slug: a.slug, cityId: doc._id, citySlug: doc.slug,
        latitude: a.lat, longitude: a.lng, isActive: true, listingCount: 0,
      })));
      for (const a of docs) area.set(`${c.name.toLowerCase()}|${a.name.toLowerCase()}`, a);
    }
  }
  return { city, area };
}

// ───────────────────────── categories & fields ─────────────────────────

type Cats = Map<string, any>; // path → category

async function seedCategories(): Promise<Cats> {
  const byPath: Cats = new Map();
  const slugs = new Set<string>();
  const unique = (base: string) => { let s = base, n = 0; while (slugs.has(s)) s = `${base}-${++n}`; slugs.add(s); return s; };

  for (const t of SEED.tops) {
    const common = { status: true, listingType: VERTICAL.listingType || "vehicle", priceMode: t.priceMode, conditionSet: t.conditions, showCondition: t.conditions.length > 0 };
    const top = await Category.create({ ...common, name: t.name, slug: unique(t.slug), path: t.slug, sequence: t.sequence, parentCategoryId: null, icon: t.icon });
    byPath.set(t.slug, top);

    const rows: any[] = [];
    if (t.brands) {
      let bi = 0;
      for (const [brand, models] of Object.entries(t.brands)) {
        const bPath = `${t.slug}/${seg(brand)}`;
        const b = await Category.create({ ...common, name: brand, slug: unique(`${t.slug}-${seg(brand)}`), path: bPath, sequence: ++bi, parentCategoryId: top._id });
        byPath.set(bPath, b);
        models.forEach((m, mi) => {
          const ms = modelSeg(brand, m);
          rows.push({ ...common, name: modelName(brand, m), slug: unique(ms), path: `${bPath}/${ms}`, sequence: mi + 1, parentCategoryId: b._id });
        });
      }
    }
    (t.types || []).forEach((name, i) => {
      const s = seg(name);
      rows.push({ ...common, name, slug: unique(`${t.slug}-${s}`), path: `${t.slug}/${s}`, sequence: i + 1, parentCategoryId: top._id });
    });
    if (rows.length) for (const d of await Category.insertMany(rows)) byPath.set(d.path!, d);
  }
  return byPath;
}

async function seedFields(cats: Cats) {
  await CustomField.insertMany(SEED.fields.map((f) => ({
    name: f.name, slug: f.slug, type: f.type, required: !!f.required, filterable: !!f.filterable,
    searchable: !!f.filterable, values: f.values || [], unit: f.unit || null, min: f.min ?? null, max: f.max ?? null,
    placeholder: f.placeholder || null, helpText: f.helpText || null, group: f.group || null,
    sequence: f.sequence, allowCustom: f.allowCustom ?? f.type === "multiselect", status: true,
    categoryIds: f.tops.map((t) => cats.get(t)?._id).filter(Boolean),
  })));
}

// ───────────────────────── pages, plans, FAQs ─────────────────────────

async function seedContent(site: string) {
  const n = VERTICAL.noun;
  const own = SEED.pages || {};
  const fill = (html: string) => html.replace(/\{site\}/g, site);
  const pages = [
    { title: "About Us", slug: "about-us", content: own.about ? fill(own.about) : `<p>${site} is a marketplace to buy and sell ${n.many} in Pakistan — new and used, from private owners and dealers, with verified sellers and direct contact.</p>` },
    { title: "How It Works", slug: "how-it-works", content: own.howItWorks ? fill(own.howItWorks) : `<h2>Selling</h2><ul><li>Tap <b>${VERTICAL.copy.sellCta}</b> and choose the ${VERTICAL.brandWord.one} and model</li><li>Add photos, the details buyers ask about and your price</li><li>Buyers contact you on WhatsApp, by phone or in chat</li></ul><h2>Buying</h2><ul><li>Browse by ${VERTICAL.brandWord.one}, model, city or budget</li><li>Contact the seller and arrange a viewing</li><li>Inspect the ${n.one} and its documents, then pay</li></ul>` },
    { title: "Safety Tips", slug: "safety-tips", content: own.safety ? fill(own.safety) : `<ul><li><strong>Never send an advance or token payment.</strong></li><li>Meet in a public place in daylight.</li><li>${VERTICAL.copy.inspectTip}</li><li>Prefer verified sellers, and report anything suspicious.</li></ul>` },
    { title: "Privacy Policy", slug: "privacy-policy", content: `<p>This page explains what ${site} collects and why. Edit it from Admin → Pages before launch.</p>` },
    { title: "Terms of Service", slug: "terms-of-service", content: `<p>By using ${site} you agree to these terms. Edit them from Admin → Pages before launch.</p>` },
    { title: "Contact Us", slug: "contact-us", content: `<p>Questions or problems? Email us and we'll get back to you.</p>` },
  ];
  await CmsPage.insertMany(pages.map((p, i) => ({ ...p, sequence: i + 1, status: true, showInFooter: true })));
  await Faq.insertMany(SEED.faqs.map((f, i) => ({ ...f, sequence: i + 1, status: true })));
  await BlogPost.insertMany(SEED.blog.map((b) => ({ ...b, status: "published", publishedAt: new Date() })));
  await ReportReason.insertMany(SEED.reportReasons.map((reason) => ({ reason })));
  await FeatureSection.insertMany(SEED.rails.map((r, i) => ({ ...r, style: "grid", sequence: i + 1 })));
  if (SEED.plans?.length) {
    await Package.insertMany(SEED.plans.map((p, i) => ({
      name: p.name, price: p.price, finalPrice: p.finalPrice,
      discountInPercentage: p.price > 0 ? Math.round((1 - p.finalPrice / p.price) * 100) : 0,
      durationDays: 30, listingLimit: p.listingLimit, featuredLimit: p.featuredLimit, featuredDurationDays: 7,
      type: "paid", sortOrder: i + 1, isPopular: !!p.isPopular, description: p.description, features: p.features,
    })));
    return;
  }
  await Package.insertMany([
    { name: "Starter", price: 999, discountInPercentage: 30, finalPrice: 699, durationDays: 30, listingLimit: 5, featuredLimit: 1, featuredDurationDays: 7, type: "paid", sortOrder: 1,
      description: `For people selling a ${n.one} or two.`, features: ["5 live ads", "1 featured ad (7 days)", "30 days validity"] },
    { name: "Business", price: 2999, discountInPercentage: 33, finalPrice: 1999, durationDays: 30, listingLimit: 25, featuredLimit: 5, featuredDurationDays: 7, type: "paid", sortOrder: 2, isPopular: true,
      description: "For regular sellers — best value.", features: ["25 live ads", "5 featured ads (7 days each)", "Priority support", "30 days validity"] },
    { name: "Dealer", price: 7499, discountInPercentage: 33, finalPrice: 4999, durationDays: 30, listingLimit: 100, featuredLimit: 20, featuredDurationDays: 7, type: "paid", sortOrder: 3,
      description: "For showrooms and dealers.", features: ["100 live ads", "20 featured ads (7 days each)", "Dealer badge eligible", "30 days validity"] },
  ]);
}

// ───────────────────────── demo ads ─────────────────────────

/** Remove every demo account and ad (and their photos and favourites). */
export async function removeDemo() {
  await dbConnect();
  const ads = await Listing.find({ isDemo: true }).select("_id galleryImages").lean();
  const ids = ads.map((a) => a._id);
  const urls = ads.flatMap((a: any) => a.galleryImages || []);
  // The generated photos go too — files (local disk or CDN) and their records.
  const media = urls.length ? await Media.find({ url: { $in: urls } }).select("_id key driver").lean() : [];
  await Promise.all((media as { key: string; driver: string }[]).map((m) => deleteStored(m).catch(() => {})));
  await Promise.all([
    Listing.deleteMany({ _id: { $in: ids } }),
    Favourite.deleteMany({ itemId: { $in: ids } }),
    media.length ? Media.deleteMany({ _id: { $in: media.map((m: any) => m._id) } }) : null,
    User.deleteMany({ isDemo: true, role: { $ne: "admin" } }),
  ]);
  for (const tag of ["categories", "locations"] as const) expireTag(tag);
  await refreshScopeCounts().catch(() => markCountsStale());
  return ids.length;
}

async function seedDemo(cats: Cats, places: Places): Promise<number> {
  const pwd = await bcrypt.hash(randomBytes(24).toString("hex"), 10); // demo accounts can't sign in
  const since = (days: number) => new Date(Date.now() - days * 864e5);
  const sellers = await User.insertMany([
    { name: `${VERTICAL.noun.One} Hub (Demo)`, email: `demo-dealer@${VERTICAL.id}.invalid`, isShop: true, shopName: `${VERTICAL.noun.One} Hub (Demo)`, verificationLevel: 3, city: "Lahore", createdAt: since(400), rating: 4.7, ratingCount: 38, salesCount: 52 },
    { name: "Demo Seller", email: `demo-seller@${VERTICAL.id}.invalid`, verificationLevel: 2, city: "Karachi", createdAt: since(120), rating: 4.5, ratingCount: 9, salesCount: 6 },
  ].map((u) => ({
    ...u, password: pwd, emailVerified: true, role: "user", isSeller: true, isDemo: true, onboardingCompleted: true,
    country: "Pakistan", verificationStatus: "verified",
  })));

  let n = 0;
  for (const [i, d] of SEED.demo.entries()) {
    const leafPath = d.brand
      ? [d.top, seg(d.brand), d.model ? modelSeg(d.brand, d.model) : ""].filter(Boolean).join("/")
      : d.type ? `${d.top}/${seg(d.type)}` : d.top;
    const leaf = cats.get(leafPath) || cats.get(d.top);
    if (!leaf) continue;
    const chain: string[] = [];
    for (let p = leafPath; p; p = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "") {
      const c = cats.get(p);
      if (c) chain.unshift(String(c._id));
    }
    const city = places.city.get(d.city.toLowerCase());
    const area = d.area ? places.area.get(`${d.city.toLowerCase()}|${d.area.toLowerCase()}`) : null;
    const seller = sellers[i % 3 === 0 ? 0 : 1];
    const image = await demoPhoto(d, String(seller._id));
    const _id = new mongoose.Types.ObjectId();
    await Listing.create({
      _id,
      name: d.title,
      slug: `${seg(d.title).slice(0, 70)}-${String(_id).slice(-6)}`,
      description: d.description,
      price: d.price,
      priceMode: leaf.priceMode === "fixed" ? "fixed" : "negotiable",
      currency: "PKR",
      mainImage: image || undefined, galleryImages: image ? [image] : [],
      address: area ? `${area.name}, ${d.city}` : d.city,
      city: d.city, state: city?.stateName || undefined, country: "Pakistan",
      location: { type: "Point", coordinates: [(area || city)?.longitude || 0, (area || city)?.latitude || 0] },
      locationRefs: { cityId: city?._id || null, areaId: area?._id || null, stateId: city?.stateId || null },
      // Demo sellers have no phone: buyers reach them in chat only.
      contactNumber: undefined, whatsappNumber: undefined,
      userId: seller._id, categoryId: leaf._id, allCategoryIds: chain,
      // No condition where the section has none (animals aren't "used" or "new").
      status: "approved", condition: (leaf.conditionSet?.length ?? 0) > 0 ? d.condition : null,
      isFeatured: !!d.featured, featuredExpiresAt: d.featured ? new Date(Date.now() + 14 * 864e5) : null,
      customFieldValues: d.specs, isDemo: true,
      clicks: 20 + ((i * 37) % 300), favouritesCount: (i * 7) % 25,
      createdAt: since(i % 12),
    });
    n++;
  }
  // Live counts on cities/areas (the archive pages read them).
  for (const c of places.city.values()) {
    await City.updateOne({ _id: c._id }, { $set: { listingCount: await Listing.countDocuments({ "locationRefs.cityId": c._id, status: "approved" }) } });
  }
  return n;
}

/** A clean illustrated cover for a demo ad (so the demo never uses anyone's real photos). */
async function demoPhoto(d: SeedDemoAd, userId: string): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const svg = demoSvg(d);
    const jpg = await sharp(Buffer.from(svg), { density: 96 }).jpeg({ quality: 82 }).toBuffer();
    const file = new File([new Uint8Array(jpg)], `${seg(d.title)}.jpg`, { type: "image/jpeg" });
    const { docs } = await saveUploads([file], { folder: "listings", isPrivate: false, userId, context: d.title, aiMode: "off" });
    return docs[0]?.url || null;
  } catch (e) {
    console.warn("[setup] demo photo skipped:", (e as Error).message);
    return null;
  }
}

/** Animal pictures for a bakra mandi's demo ads, by the section's icon. */
function animalArt(kind: string, t: string): string | null {
  const ink = `stroke="#44403c" stroke-width="6" stroke-linejoin="round"`;
  const shadow = `<ellipse cx="640" cy="712" rx="400" ry="22" fill="#0f172a" opacity=".16"/>`;
  const legs = (xs: number[], top: number, w = 34, fill = t) =>
    xs.map((x) => `<rect x="${x}" y="${top}" width="${w}" height="${705 - top}" rx="14" fill="${fill}" ${ink}/><rect x="${x - 3}" y="690" width="${w + 6}" height="18" rx="6" fill="#292524"/>`).join("");
  switch (kind) {
    case "goat":
      return `${shadow}${legs([455, 520, 745, 810], 520)}
        <path d="M880 420c30-30 45-60 40-90" stroke="#44403c" stroke-width="18" fill="none" stroke-linecap="round"/>
        <path d="M430 470c0-80 80-120 200-120h160c70 0 110 40 110 110v20c0 60-40 100-110 100H540c-70 0-110-40-110-110z" fill="${t}" ${ink}/>
        <path d="M470 410L400 290c-10-20-30-30-55-28l-60 8c-25 4-35 30-20 48l40 40c15 15 35 20 55 15l35-8 55 95z" fill="${t}" ${ink}/>
        <path d="M372 262c10-70 60-110 130-100" stroke="#57534e" stroke-width="20" fill="none" stroke-linecap="round"/>
        <path d="M395 285c40 20 70 50 75 95-35-10-65-40-80-80z" fill="${t}" ${ink}/>
        <circle cx="335" cy="292" r="9" fill="#1c1917"/><path d="M285 345l-12 60 30-45z" fill="#44403c"/>`;
    case "sheep": {
      const wool = Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        return `<circle cx="${(650 + 215 * Math.cos(a)).toFixed(0)}" cy="${(450 + 110 * Math.sin(a)).toFixed(0)}" r="58" fill="${t}" ${ink}/>`;
      }).join("");
      return `${shadow}${legs([500, 560, 740, 800], 540, 30, "#3f3f46")}
        <ellipse cx="900" cy="485" rx="78" ry="92" fill="${t}" ${ink}/>
        ${wool}<ellipse cx="650" cy="450" rx="235" ry="125" fill="${t}"/>
        <path d="M455 400c-20-25-60-30-85-12l-55 40c-25 20-20 60 10 72l55 20c30 10 60-5 75-30z" fill="#3f3f46"/>
        <path d="M420 395c25-30 65-35 85-20-15 30-45 45-80 40z" fill="#3f3f46"/>
        <circle cx="380" cy="440" r="9" fill="#fafaf9"/>`;
    }
    case "cow":
    case "buffalo": {
      const hump = kind === "cow" ? `<circle cx="525" cy="372" r="58" fill="${t}" ${ink}/>` : "";
      const horns = kind === "cow"
        ? `<path d="M350 366c-5-35 5-62 26-78" stroke="#57534e" stroke-width="18" fill="none" stroke-linecap="round"/>`
        : `<path d="M365 372c-70-40-130-5-120 55" stroke="#57534e" stroke-width="22" fill="none" stroke-linecap="round"/>`;
      return `${shadow}${legs([470, 535, 775, 840], 500, 40)}
        <path d="M905 410c40 40 50 110 30 170" stroke="#44403c" stroke-width="12" fill="none" stroke-linecap="round"/><ellipse cx="935" cy="590" rx="16" ry="30" fill="#292524"/>
        ${hump}<rect x="430" y="360" width="480" height="210" rx="95" fill="${t}" ${ink}/>
        <path d="M400 470c20 70 70 90 100 70l-20-70z" fill="${t}" ${ink}/>
        <path d="M480 400L360 362c-30-10-60 0-70 30l-20 80c-5 25 15 40 40 35l50-10c20-5 35-20 40-40l80 15z" fill="${t}" ${ink}/>
        ${horns}<ellipse cx="392" cy="380" rx="30" ry="16" fill="${t}" ${ink} transform="rotate(25 392 380)"/>
        <ellipse cx="292" cy="482" rx="28" ry="24" fill="#57534e"/><circle cx="342" cy="412" r="9" fill="#1c1917"/>`;
    }
    case "camel":
      return `${shadow}${legs([525, 580, 800, 855], 470, 28)}
        <path d="M880 430c20 30 20 70 5 100" stroke="#44403c" stroke-width="12" fill="none" stroke-linecap="round"/>
        <path d="M480 470c0-70 60-110 120-110 40-60 160-60 190 0 70 5 100 50 90 110-10 50-60 70-120 70H560c-50 0-80-25-80-70z" fill="${t}" ${ink}/>
        <path d="M520 440c-50-20-80-60-100-120-10-30-30-50-60-52l-60 4c-20 2-25 28-8 38l48 10c30 10 40 40 55 80 15 50 55 80 105 90z" fill="${t}" ${ink}/>
        <path d="M352 262l14-26 16 28z" fill="${t}" ${ink}/><circle cx="330" cy="288" r="9" fill="#1c1917"/>`;
    case "butcher":
      return `<ellipse cx="620" cy="720" rx="300" ry="20" fill="#0f172a" opacity=".16"/>
        <path d="M330 300h470c20 0 30 10 30 30v170c0 20-10 30-30 30H380c-30 0-50-20-50-50z" fill="#cbd5e1" ${ink}/>
        <circle cx="420" cy="360" r="22" fill="#94a3b8"/>
        <rect x="830" y="380" width="230" height="70" rx="30" fill="${t}" ${ink}/>`;
    case "feed":
      return `<ellipse cx="620" cy="720" rx="300" ry="20" fill="#0f172a" opacity=".16"/>
        ${Array.from({ length: 9 }, (_, k) => {
          const x = 470 + k * 38, lean = (k - 4) * 18;
          return `<path d="M620 690L${x + lean} 330" stroke="${t}" stroke-width="16" stroke-linecap="round"/>${[0, 1, 2, 3].map((g) => `<ellipse cx="${x + lean * (1 - g * 0.08)}" cy="${340 + g * 40}" rx="16" ry="28" fill="#ca8a04"/>`).join("")}`;
        }).join("")}
        <rect x="560" y="560" width="120" height="40" rx="12" fill="#92400e"/>`;
    default:
      return null;
  }
}

function demoSvg(d: SeedDemoAd): string {
  const t = d.tint;
  const icon = SEED.tops.find((x) => x.slug === d.top)?.icon || "";
  const animal = animalArt(icon === "shares" ? "cow" : icon, t);
  if (animal) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1240 900">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0fdf4"/><stop offset="1" stop-color="#dcfce7"/></linearGradient></defs>
    <rect width="1240" height="900" fill="url(#bg)"/>
    <rect y="700" width="1240" height="200" fill="#86efac" opacity=".45"/>
    ${animal}
  </svg>`;
  }
  const shape = /helmet/i.test(`${d.title} ${d.type || ""}`) ? "helmet"
    : d.top.includes("tyre") || /rim|tyre|wheel/i.test(d.type || "") ? "wheel"
    : VERTICAL.id === "bikes" ? "bike" : "car";
  const art: Record<string, string> = {
    car: `
      <ellipse cx="620" cy="700" rx="470" ry="26" fill="#0f172a" opacity=".18"/>
      <path d="M170 600c0-40 26-62 76-70l170-22c48-52 122-104 210-112h206c64 0 118 42 168 104l86 16c42 8 64 34 64 70v58c0 18-12 28-30 28H196c-16 0-26-10-26-26z" fill="${t}"/>
      <path d="M450 506c42-46 100-84 170-88h96v88z" fill="#0f172a" opacity=".55"/>
      <path d="M736 418h86c52 0 94 36 132 88H736z" fill="#0f172a" opacity=".55"/>
      <path d="M180 600h900" stroke="#fff" stroke-opacity=".18" stroke-width="6"/>
      <circle cx="350" cy="672" r="82" fill="#111827"/><circle cx="350" cy="672" r="44" fill="#9ca3af"/>
      <circle cx="930" cy="672" r="82" fill="#111827"/><circle cx="930" cy="672" r="44" fill="#9ca3af"/>
      <rect x="1052" y="566" width="40" height="20" rx="8" fill="#fde68a"/>`,
    bike: `
      <ellipse cx="620" cy="752" rx="420" ry="22" fill="#0f172a" opacity=".18"/>
      <circle cx="360" cy="632" r="118" fill="none" stroke="#111827" stroke-width="34"/><circle cx="360" cy="632" r="22" fill="#6b7280"/>
      <circle cx="900" cy="632" r="118" fill="none" stroke="#111827" stroke-width="34"/><circle cx="900" cy="632" r="22" fill="#6b7280"/>
      <path d="M360 632L560 560" stroke="#374151" stroke-width="22" stroke-linecap="round"/>
      <path d="M900 632L800 380" stroke="#374151" stroke-width="24" stroke-linecap="round"/>
      <rect x="540" y="500" width="170" height="110" rx="18" fill="#4b5563"/>
      <path d="M560 470c30-60 150-72 210-30l-10 60H560z" fill="${t}"/>
      <path d="M400 450h170l-10 40H420c-20 0-30-26-20-40z" fill="#1f2937"/>
      <path d="M300 520c20-50 80-70 130-60" stroke="${t}" stroke-width="26" fill="none" stroke-linecap="round"/>
      <path d="M760 360l90-14" stroke="#111827" stroke-width="16" stroke-linecap="round"/>
      <circle cx="840" cy="420" r="30" fill="#fde68a" stroke="${t}" stroke-width="10"/>
      <path d="M600 620H330" stroke="#9ca3af" stroke-width="18" stroke-linecap="round"/>`,
    wheel: `
      <ellipse cx="620" cy="760" rx="300" ry="20" fill="#0f172a" opacity=".18"/>
      <circle cx="620" cy="460" r="280" fill="#111827"/><circle cx="620" cy="460" r="190" fill="${t}"/>
      ${Array.from({ length: 10 }, (_, k) => `<path d="M620 460L${(620 + 180 * Math.cos((k * Math.PI) / 5)).toFixed(0)} ${(460 + 180 * Math.sin((k * Math.PI) / 5)).toFixed(0)}" stroke="#e5e7eb" stroke-width="26" stroke-linecap="round"/>`).join("")}
      <circle cx="620" cy="460" r="46" fill="#e5e7eb"/>`,
    helmet: `
      <ellipse cx="620" cy="720" rx="300" ry="22" fill="#0f172a" opacity=".18"/>
      <path d="M360 640c0-240 130-380 300-380 170 0 250 150 250 290v90z" fill="${t}"/>
      <path d="M640 420h250c20 0 30 20 30 40v90H660c-40 0-60-30-50-70z" fill="#0f172a" opacity=".75"/>
      <path d="M360 640h550" stroke="#0f172a" stroke-width="20" stroke-linecap="round"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1240 900">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient></defs>
    <rect width="1240" height="900" fill="url(#bg)"/>
    <rect y="700" width="1240" height="200" fill="#cbd5e1" opacity=".35"/>
    ${art[shape]}
  </svg>`;
}
