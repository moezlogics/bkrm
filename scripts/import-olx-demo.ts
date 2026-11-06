/**
 * LOCAL TESTING ONLY — fill the local database with real-looking animal ads
 * copied from OLX Pakistan, so the site can be tested with real photos,
 * prices and descriptions.
 *
 * What it copies: title, price, breed, age, gender, description, the
 * locality (city / area) and up to 5 photos per ad. What it never copies:
 * the OLX seller's name, phone number or account — phone numbers and emails
 * are also stripped from titles and descriptions. Every ad goes to one of a
 * few demo seller accounts and is flagged `isDemo`, so
 * Admin → Dashboard → "Remove demo data" deletes all of it (ads, photos,
 * demo sellers) in one go.
 *
 * Never run this against the live site: the photos and text belong to other
 * people. The script refuses unless MONGODB_URI points at this machine and
 * MEDIA_DRIVER is "local".
 *
 *   npx tsx --tsconfig tsconfig.json scripts/import-olx-demo.ts --dry-run
 *   npx tsx --tsconfig tsconfig.json scripts/import-olx-demo.ts
 *
 * Env comes from .env.local (MONGODB_URI, MEDIA_DRIVER, NEXT_PUBLIC_VERTICAL).
 * Re-running first removes the previous demo data, then imports afresh.
 */
import fs from "fs";
import path from "path";

// ── env (before any app module reads it) ────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const DRY = process.argv.includes("--dry-run");
const uri = process.env.MONGODB_URI || "";
const host = (() => { try { return new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).hostname; } catch { return ""; } })();
if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(host)) {
  console.error(`Refusing: MONGODB_URI is not a local database (${host || "unset"}). This script is for local testing only.`);
  process.exit(1);
}
if ((process.env.MEDIA_DRIVER || "local") !== "local") {
  console.error("Refusing: MEDIA_DRIVER must be 'local'. OLX photos must never be uploaded to the live CDN.");
  process.exit(1);
}
if (process.env.NEXT_PUBLIC_VERTICAL !== "bakra") {
  console.error("Refusing: NEXT_PUBLIC_VERTICAL is not 'bakra'.");
  process.exit(1);
}

// ── OLX ──────────────────────────────────────────────────────────────────
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stateOf(html: string): any {
  const m = "window.state = ";
  const i = html.indexOf(m);
  if (i < 0) return null;
  try { return JSON.parse(html.slice(i + m.length).split(";</script>")[0].split(";\n")[0]); } catch { return null; }
}
async function getState(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25_000) });
      if (res.ok) return stateOf(await res.text());
    } catch { /* retry */ }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}
async function hits(url: string, pages: number): Promise<any[]> {
  const out: any[] = [];
  for (let p = 1; p <= pages; p++) {
    const st = await getState(p === 1 ? url : `${url}${url.includes("?") ? "&" : "?"}page=${p}`);
    const h = st?.algolia?.content?.hits || [];
    out.push(...h);
    if (h.length < 20) break;
    await sleep(600);
  }
  return out;
}

// ── cleaning ─────────────────────────────────────────────────────────────
// Pakistani mobile numbers in every common spelling (also glued to text: "me_0325…").
const PHONE = /(?:\+?\s*92|(?<!\d)0)[\s.\-]*3\d{2}[\s.\-]*\d{3}[\s.\-]*\d{4}(?!\d)|(?<!\d)3\d{2}[\s.\-]?\d{7}(?!\d)|(?<!\d)\d{4}[\s.\-]\d{7}(?!\d)|(?<!\d)\d{10,13}(?!\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const CONTACT_WORDS = /\b(call|whats\s*app|whatsapp|wa|contact|rabta|number|no\.?)\s*(me|us|karein|kren|krain|on|at|:|=|-)*\s*$/gim;

function clean(s: string): string {
  return String(s || "")
    .replace(/\*\*/g, "")
    .replace(/_/g, " ")
    .replace(PHONE, "")
    .replace(EMAIL, "")
    .replace(/\bolx\b/gi, "")
    .replace(CONTACT_WORDS, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function cleanTitle(s: string): string {
  const t = clean(s).replace(/[|_=~]+/g, " ").replace(/\s{2,}/g, " ").replace(/[\s,\-–:.]+$/g, "").trim();
  return t.length > 80 ? t.slice(0, 80).replace(/\s+\S*$/, "") : t;
}
const titleCase = (s: string) => s.replace(/\S+/g, (w) => (w.length > 2 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w));

// ── mapping to Bakra Mandi ──────────────────────────────────────────────
type Kind = "small" | "big" | "camel";
type Source = { top: string; kind: Kind; url: string; pages: number; take: number; minPrice: number; maxPrice: number; keep?: RegExp; drop?: RegExp };

const SOURCES: Source[] = [
  { top: "bakray", kind: "small", url: "https://www.olx.com.pk/goats_c708098", pages: 4, take: 44, minPrice: 18000, maxPrice: 1_500_000 },
  { top: "dumbay-chatray", kind: "small", url: "https://www.olx.com.pk/sheep_c708099", pages: 3, take: 16, minPrice: 18000, maxPrice: 1_200_000 },
  { top: "gaye-bail", kind: "big", url: "https://www.olx.com.pk/cows_c708097", pages: 3, take: 22, minPrice: 90000, maxPrice: 5_000_000, drop: /friesian|jersey|holstein|milk|doodh|dodh|calf for milk/i },
  { top: "oont", kind: "camel", url: "https://www.olx.com.pk/camels_c708096", pages: 1, take: 6, minPrice: 120000, maxPrice: 6_000_000 },
  { top: "oont", kind: "camel", url: "https://www.olx.com.pk/items/q-oont", pages: 1, take: 4, minPrice: 120000, maxPrice: 6_000_000, keep: /oont|unt|camel/i },
  { top: "bhains-katta", kind: "big", url: "https://www.olx.com.pk/buffalos_c708094", pages: 2, take: 12, minPrice: 90000, maxPrice: 3_000_000 },
];
// Feed ads. (OLX has almost no qasai or hissa ads outside Eid season, so
// those are written below as test ads instead — see SERVICE_ADS / SHARE_ADS.)
const EXTRA = {
  chara: { urls: ["https://www.olx.com.pk/items/q-bhoosa", "https://www.olx.com.pk/items/q-chara", "https://www.olx.com.pk/items/q-wanda"], take: 5 },
};

// Test ads for the booking flows (qasai) and qurbani shares (hissa).
const SERVICE_ADS = [
  { title: "Qasai team for Eid — bakra, gaye and oont", city: "Lahore", area: "Johar Town", rates: [4000, 12000, 25000], cap: 14,
    description: "Experienced team of 4. Zabah, skin, cutting, qeema and packing in bags. We come to your home on Eid day 1, 2 and 3. Book your day early — slots fill up fast." },
  { title: "Eid qasai service — home visit, cutting & packing", city: "Karachi", area: "Gulshan-e-Iqbal", rates: [3500, 11000, 0], cap: 12,
    description: "Small and big animals. Clean work, proper cutting for handi, karahi and qeema. Packing bags included. Available all three days of Eid." },
  { title: "Professional qasai — Islamabad & Rawalpindi", city: "Islamabad", area: "G-11", rates: [4500, 14000, 30000], cap: 10,
    description: "Home service across Islamabad and Rawalpindi. Zabah, cutting, qeema and packing. Bring your animal to the gate, we do the rest." },
  { title: "Qasai available before and on Eid — Faisalabad", city: "Faisalabad", area: "Madina Town", rates: [3000, 10000, 22000], cap: 16,
    description: "Team of 5 with our own tools. Before-Eid slaughter for aqeeqah and sadqa too. Fair rates, on-time arrival." },
];
const SHARE_ADS = [
  { title: "Gaye ka hissa — Sahiwal bail, Eid day 1", city: "Karachi", area: "Gulshan-e-Iqbal", animal: "Cow / Bull", day: "Eid day 1", price: 32000, left: 3 },
  { title: "Ijtimai qurbani — cow share with home delivery", city: "Lahore", area: "Model Town", animal: "Cow / Bull", day: "Eid day 2", price: 29000, left: 5 },
  { title: "Oont ka hissa — Marecha oont, Eid day 1", city: "Bahawalpur", area: "", animal: "Camel", day: "Eid day 1", price: 55000, left: 4 },
  { title: "Bail ka hissa — Cholistani, video of qurbani", city: "Islamabad", area: "I-12 Mandi", animal: "Cow / Bull", day: "Eid day 3", price: 35000, left: 2 },
];

const BREEDS: Record<string, [RegExp, string][]> = {
  bakray: [
    [/beetal|bital|nagri|faisalabadi|amritsari|laal\s*dabb?a|ablaq/i, "Beetal"], [/makh?i\s*ch(ee|i)n/i, "Makhi Cheeni"], [/rajan\s*pur/i, "Rajanpuri"],
    [/teddy|tedy/i, "Teddy"], [/kamori|kamori/i, "Kamori"], [/barbari|bar bari/i, "Barbari"], [/nachi/i, "Nachi"], [/pateri|patiri/i, "Pateri"],
    [/dera\s*din|ddp/i, "Dera Din Panah"], [/gulabi|ghulabi|pink/i, "Gulabi"], [/lehri|lehari/i, "Lehri"], [/kaghani|kagani/i, "Kaghani"],
  ],
  "dumbay-chatray": [
    [/afghan/i, "Afghani Dumba"], [/baloch/i, "Balochi"], [/kajli|kajla/i, "Kajli"], [/lohi/i, "Lohi"], [/kachhi|kachi/i, "Kachhi"], [/thall?i/i, "Thalli"],
    [/rakhshan/i, "Rakhshani"], [/hashtnagr/i, "Hashtnagri"], [/damani/i, "Damani"], [/dumba|dumbi/i, "Afghani Dumba"],
  ],
  "gaye-bail": [
    [/sahiwal|sahiwali/i, "Sahiwal"], [/cholistan/i, "Cholistani"], [/red\s*sindhi|sindhi/i, "Red Sindhi"], [/thar\s*parkar|thari/i, "Tharparkar"],
    [/dhann?i/i, "Dhanni"], [/bhag\s*nari/i, "Bhagnari"], [/lohani/i, "Lohani"], [/dajal/i, "Dajal"], [/achai/i, "Achai"],
    [/australian|austr|cross/i, "Australian Cross"], [/brahm/i, "Brahman"],
  ],
  oont: [[/marecha|mareecha/i, "Marecha"], [/barela/i, "Barela"], [/brahvi/i, "Brahvi"], [/kohi/i, "Kohi"], [/thari/i, "Thari"]],
  "bhains-katta": [[/nili|neeli|ravi/i, "Nili-Ravi"], [/kundi|kundhi/i, "Kundi"], [/azi\s*kheli/i, "Azi Kheli"]],
};
function breedOf(top: string, olxType: string, text: string): string {
  const t = `${olxType === "other" ? "" : olxType} ${text}`;
  for (const [re, name] of BREEDS[top] || []) if (re.test(t)) return name;
  return "Desi / Other";
}

function ageDays(ef: any): number | null {
  if (typeof ef?.age_in_days === "number" && ef.age_in_days > 0 && ef.age_in_days < 9000) return ef.age_in_days;
  const n = Number(ef?.age);
  if (!n) return null;
  const d = ef?.age_unit === "year" ? n * 365 : ef?.age_unit === "day" ? n : n * 30;
  return d < 9000 ? d : null;
}
function ageLabel(days: number | null): string | undefined {
  if (days == null) return undefined;
  const y = days / 365;
  if (y < 0.9) return "Under 1 year";
  if (y < 1.25) return "1 year";
  if (y < 1.75) return "1.5 years";
  if (y < 2.25) return "2 years";
  if (y < 2.75) return "2.5 years";
  if (y < 3.5) return "3 years";
  if (y < 4.5) return "4 years";
  if (y < 5.5) return "5 years";
  return "6+ years";
}
function teethOf(kind: Kind, text: string, days: number | null): string {
  const t = text.toLowerCase();
  if (/full\s*mouth|8\s*(daa?nt|dant)|aath\s*daa?nt|kharr?a\s*daa?nt/.test(t)) return "Full mouth (8 dant)";
  if (/\b6\s*(daa?nt|teeth)|chhe?\s*daa?nt|chay\s*daa?nt/.test(t)) return "6 Dant";
  if (/\b4\s*(daa?nt|teeth)|cha+r\s*daa?nt|chaugga|chogga/.test(t)) return "4 Dant";
  if (/\b2\s*(daa?nt|teeth)|do\s*daa?nt|dau?nda|dondha|donda|dunda/.test(t)) return "2 Dant";
  if (/kh(ee|i)ra|kheera|khira|milk\s*teeth/.test(t)) return "Kheera (milk teeth)";
  const d = days ?? (kind === "small" ? 420 : kind === "big" ? 800 : 1900);
  const steps = kind === "small" ? [380, 640, 900, 1200] : kind === "big" ? [730, 1000, 1300, 1650] : [1700, 2100, 2500, 2900];
  const labels = ["Kheera (milk teeth)", "2 Dant", "4 Dant", "6 Dant", "Full mouth (8 dant)"];
  const i = steps.findIndex((s) => d < s);
  return labels[i < 0 ? 4 : i];
}
function weightOf(text: string): number | undefined {
  const kg = text.match(/(\d{2,4}(?:\.\d)?)\s*(?:kg|kgs|kilo|kilogram)\b/i);
  if (kg) return Math.round(Number(kg[1]));
  const mn = text.match(/(\d{1,2}(?:\.\d)?)\s*(?:man|mann|maund|mun|mon)\b/i);
  if (mn) return Math.round(Number(mn[1]) * 40);
  return undefined;
}
function colourOf(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/black\s*(&|and|\/)?\s*white|kala\s*safaid|ablaq/.test(t)) return "Black & White";
  if (/brown\s*(&|and|\/)?\s*white/.test(t)) return "Brown & White";
  if (/cheeni|chini|spotted|makhi/.test(t)) return "Spotted (cheeni)";
  if (/golden|sunehr/.test(t)) return "Golden";
  if (/\bred\b|laal|lal\b/.test(t)) return "Red";
  if (/white|safaid|safed|chitta|bagga/.test(t)) return "White";
  if (/black|kala|kaala|kali/.test(t)) return "Black";
  if (/brown|bhura/.test(t)) return "Brown";
  if (/grey|gray|surmai/.test(t)) return "Grey";
  return undefined;
}
function highlightsOf(text: string, teeth: string): string[] {
  const t = text.toLowerCase();
  const h: string[] = [];
  if (teeth !== "Kheera (milk teeth)") h.push("Qurbani age complete");
  if (/be\s*-?aib|no\s*defect|without\s*defect|bilkul\s*theek|healthy|sehat/.test(t)) h.push("No defect (be-aib)");
  if (/vaccin|teeka|tika/.test(t)) h.push("Vaccinated");
  if (/deworm|keeray|keera\s*mar/.test(t)) h.push("Dewormed");
  if (/desi\s*(feed|khurak|khorak|ghiza)|ghar\s*ka\s*pala|home\s*bred|home\s*raised/.test(t)) h.push("Desi feed");
  if (/rakhwali|till\s*eid|eid\s*tak/.test(t)) h.push("Kept until Eid (rakhwali)");
  if (/show|competition|shoq|shok|shauq/.test(t)) h.push("Show quality");
  if (/\bpair\b|jora|jorri|jodi/.test(t)) h.push("Pair available");
  return h;
}

// ── demo sellers (fictional; nobody can sign in as them) ─────────────────
const SELLERS = [
  { name: "Haji Rafiq Cattle Farm", isShop: true, city: "Lahore", verificationLevel: 3 },
  { name: "Al-Madina Goat Farm", isShop: true, city: "Karachi", verificationLevel: 3 },
  { name: "Chaudhry Livestock", isShop: true, city: "Faisalabad", verificationLevel: 3 },
  { name: "Sajid Beopari", isShop: false, city: "Multan", verificationLevel: 2 },
  { name: "Imran Farms", isShop: true, city: "Rawalpindi", verificationLevel: 2 },
  { name: "Noman Ahmed", isShop: false, city: "Islamabad", verificationLevel: 2 },
  { name: "Bilal Qureshi", isShop: false, city: "Hyderabad", verificationLevel: 0 },
  { name: "Thar Camel Traders", isShop: true, city: "Bahawalpur", verificationLevel: 2 },
];

// ── run ──────────────────────────────────────────────────────────────────
async function main() {
  const [{ default: dbConnect }, { default: mongoose }, { default: bcrypt }, { randomBytes }] = await Promise.all([
    import("@/lib/mongodb"), import("mongoose"), import("bcryptjs"), import("crypto"),
  ]);
  const { default: Listing } = await import("@/models/Listing");
  const { default: User } = await import("@/models/User");
  const { default: Category } = await import("@/models/Category");
  const { default: City } = await import("@/models/City");
  const { default: Area } = await import("@/models/Area");
  const { saveUploads } = await import("@/lib/media-store");
  const { removeDemo } = await import("@/lib/setup");
  const { refreshScopeCounts } = await import("@/lib/scope-counts");
  const { seg } = await import("@/lib/taxonomy");

  await dbConnect();
  const cats = new Map((await Category.find({}).lean()).map((c: any) => [c.path, c]));
  const cities = (await City.find({}).lean()) as any[];
  const cityByName = new Map(cities.map((c) => [c.name.toLowerCase(), c]));
  const cityById = new Map(cities.map((c) => [String(c._id), c]));
  const areas = (await Area.find({}).lean()) as any[];
  const areaByCity = new Map<string, any[]>();
  for (const a of areas) (areaByCity.get(String(a.cityId)) || areaByCity.set(String(a.cityId), []).get(String(a.cityId))!).push(a);

  function placeOf(h: any): { city: any; area: any; areaName: string } | null {
    const loc: any[] = h.location || [];
    const names = loc.map((l) => String(l.name));
    let city: any = null;
    let idx = -1;
    for (let i = names.length - 1; i >= 0; i--) {
      const n = names[i].toLowerCase().replace(/^d\.?\s*g\.?\s*khan$/, "dera ghazi khan").replace(/^r\.?\s*y\.?\s*khan$/, "rahim yar khan").replace(/^d\.?\s*i\.?\s*khan$/, "dera ismail khan");
      const c = cityByName.get(n) || cities.find((x) => x.name.toLowerCase().startsWith(n) && n.length > 4);
      if (c) { city = c; idx = i; break; }
    }
    if (!city) return null;
    const areaName = names[idx + 1] || "";
    const list = areaByCity.get(String(city._id)) || [];
    const a = areaName ? list.find((x) => x.name.toLowerCase() === areaName.toLowerCase()) || list.find((x) => areaName.toLowerCase().includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(areaName.toLowerCase())) : null;
    return { city, area: a || null, areaName };
  }

  // 1) collect
  type Item = { h: any; top: string; type: string; kind: Kind | "service" | "share" | "feed" };
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const s of SOURCES) {
    const list = await hits(s.url, s.pages);
    let n = 0;
    for (const h of list) {
      if (n >= s.take) break;
      if (seen.has(h.externalID) || !h.category?.some((c: any) => c.slug === "livestock")) continue;
      const price = Number(h.extraFields?.price || 0);
      const text = `${h.title}`;
      if (Number(h.photoCount || 0) < 2 || price < s.minPrice || price > s.maxPrice) continue;
      if (s.keep && !s.keep.test(text)) continue;
      if (s.drop && s.drop.test(`${text} ${h.extraFields?.type || ""}`)) continue;
      if (!placeOf(h)) continue;
      seen.add(h.externalID);
      items.push({ h, top: s.top, type: "", kind: s.kind });
      n++;
    }
    console.log(`${s.url}: ${n}`);
  }
  {
    let n = 0;
    for (const url of EXTRA.chara.urls) {
      for (const h of await hits(url, 1)) {
        if (n >= EXTRA.chara.take) break;
        if (seen.has(h.externalID) || Number(h.photoCount || 0) < 1 || !placeOf(h)) continue;
        const t = `${h.title}`.toLowerCase();
        if (!/chara|wanda|bhoosa|bhusa|feed|ghaas|khal|husk/.test(t) || !h.category?.some((c: any) => c.slug === "animals")) continue;
        seen.add(h.externalID);
        items.push({ h, top: "chara-saman", type: "Chara & Wanda", kind: "feed" });
        n++;
      }
    }
    console.log(`feed: ${n}`);
  }
  console.log(`collected ${items.length} ads`);

  // 2) details (description) from each ad page
  for (const [i, it] of items.entries()) {
    const st = await getState(`https://www.olx.com.pk/item/${it.h.slug}-iid-${it.h.externalID}`);
    it.h.__desc = st?.ad?.data?.description || "";
    // Search results carry only the cover photo; the ad page has them all.
    if (Array.isArray(st?.ad?.data?.photos) && st.ad.data.photos.length) it.h.photos = st.ad.data.photos;
    if ((i + 1) % 10 === 0) console.log(`  details ${i + 1}/${items.length}`);
    await sleep(350);
  }

  if (DRY) {
    for (const it of items) {
      const text = `${it.h.title}\n${it.h.__desc}`;
      console.log(`[${it.top}] ${cleanTitle(it.h.title)} | Rs ${it.h.extraFields?.price || "-"} | ${it.kind === "small" || it.kind === "big" || it.kind === "camel" ? `${breedOf(it.top, it.h.extraFields?.type || "", text)} | ${teethOf(it.kind, text, ageDays(it.h.extraFields))}` : it.type} | ${placeOf(it.h)?.city.name} | ${(it.h.photos || []).length} photos`);
    }
    await mongoose.disconnect();
    return;
  }

  // 3) wipe the previous demo data (ads, photos, demo sellers)
  const removed = await removeDemo();
  console.log(`removed ${removed} old demo ads`);

  // 4) demo sellers
  const pwd = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
  const since = (days: number) => new Date(Date.now() - days * 864e5);
  const sellers = await User.insertMany(SELLERS.map((s, i) => ({
    name: s.name, email: `demo-${seg(s.name)}@bakra.invalid`, password: pwd, emailVerified: true, role: "user", isSeller: true, isDemo: true,
    onboardingCompleted: true, country: "Pakistan", city: s.city, isShop: s.isShop, ...(s.isShop ? { shopName: s.name } : {}),
    verificationLevel: s.verificationLevel, verificationStatus: s.verificationLevel >= 2 ? "verified" : "unverified",
    rating: 4 + ((i * 3) % 10) / 10, ratingCount: 3 + i * 4, salesCount: 2 + i * 5, createdAt: since(90 + i * 40),
  })));
  const sellerFor = (cityName: string, i: number) => sellers.find((s: any) => s.city === cityName) || sellers[i % sellers.length];

  // 5) ads
  let made = 0;
  const photosByTop: Record<string, string[]> = {};
  for (const [i, it] of items.entries()) {
    const h = it.h;
    const ef = h.extraFields || {};
    const rawText = `${h.title}\n${h.__desc || ""}`;
    const title = titleCase(cleanTitle(h.title));
    if (title.length < 4) continue;
    const place = placeOf(h)!;
    const isAnimal = it.kind === "small" || it.kind === "big" || it.kind === "camel";
    const type = isAnimal ? breedOf(it.top, ef.type || "", rawText) : it.type;
    const leafPath = `${it.top}/${seg(type)}`;
    const leaf: any = cats.get(leafPath) || cats.get(it.top);
    const topCat: any = cats.get(it.top);
    if (!leaf || !topCat) { console.warn("no category", leafPath); continue; }
    const chain = [String(topCat._id), ...(leaf !== topCat ? [String(leaf._id)] : [])];

    let price = Number(ef.price || 0) || null;
    const specs: Record<string, any> = {};
    if (isAnimal) {
      const days = ageDays(ef);
      const teeth = teethOf(it.kind as Kind, rawText, days);
      specs.teeth = teeth;
      const age = ageLabel(days);
      if (age) specs.age = age;
      const w = weightOf(rawText);
      if (w && w >= 10 && w <= 1400) specs.weight_kg = w;
      specs.gender = /khass?i|castrat/i.test(rawText) ? "Khassi (castrated)" : ef.sex === "female" ? "Female" : "Male";
      if (ef.sex === "pair") specs.quantity = 2;
      const col = colourOf(rawText);
      if (col) specs.colour = col;
      specs.kept_at = /mandi/i.test(rawText) ? "Mandi" : /farm/i.test(rawText) ? "Farm" : "Home";
      if (/deliver/i.test(rawText)) specs.delivery = "Home delivery available";
      const hl = highlightsOf(rawText, teeth);
      if (hl.length) specs.highlights = hl;
    } else {
      specs.price_basis = /maund|mun\b|man\b/i.test(rawText) ? "Per maund" : "Per kg";
      if (/deliver/i.test(rawText)) specs.delivery = "Home delivery available";
    }

    // Photos → this site's own media store (local disk in development).
    const seller: any = sellerFor(place.city.name, i);
    const urls: string[] = [];
    for (const p of (h.photos || []).slice(0, 5)) {
      try {
        const res = await fetch(`https://images.olx.com.pk/thumbnails/${p.id}-800x600.webp`, { headers: UA, signal: AbortSignal.timeout(25_000) });
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        const file = new File([buf], `${seg(title).slice(0, 50) || "animal"}.webp`, { type: "image/webp" });
        const { docs } = await saveUploads([file], { folder: "listings", isPrivate: false, userId: String(seller._id), context: title, aiMode: "off" });
        if (docs[0]?.url) urls.push(docs[0].url);
      } catch { /* skip a photo that fails */ }
    }
    if (!urls.length) continue;

    let description = clean(h.__desc || "");
    if (description.length < 30) description = `${title}. ${isAnimal ? "Healthy animal, see in person before buying." : ""}`.trim();
    if (description.length > 2500) description = description.slice(0, 2500);

    const areaRef = place.area;
    const point = areaRef?.longitude && areaRef?.latitude ? [areaRef.longitude, areaRef.latitude] : [place.city.longitude || 0, place.city.latitude || 0];
    const created = Number(h.timestamp) ? new Date(Math.min(Date.now() - 3600e3, Number(h.timestamp) * 1000)) : since(i % 20);
    const _id = new mongoose.Types.ObjectId();
    await Listing.create({
      _id,
      name: title,
      slug: `${seg(title).slice(0, 70)}-${String(_id).slice(-6)}`,
      description,
      price: price || undefined,
      priceMode: price ? (leaf.priceMode === "fixed" || topCat.priceMode === "fixed" ? "fixed" : "negotiable") : "contact",
      currency: "PKR",
      mainImage: urls[0], galleryImages: urls,
      address: place.areaName && place.areaName.toLowerCase() !== place.city.name.toLowerCase() ? `${areaRef?.name || place.areaName}, ${place.city.name}` : place.city.name,
      city: place.city.name, state: place.city.stateName || undefined, country: "Pakistan",
      location: { type: "Point", coordinates: point },
      locationRefs: { cityId: place.city._id, areaId: areaRef?._id || null, stateId: place.city.stateId || null },
      contactNumber: undefined, whatsappNumber: undefined,
      userId: seller._id, categoryId: leaf._id, allCategoryIds: chain,
      status: "approved", condition: null,
      isFeatured: i % 9 === 0, featuredExpiresAt: i % 9 === 0 ? new Date(Date.now() + 14 * 864e5) : null,
      customFieldValues: specs, isDemo: true,
      clicks: 15 + ((i * 37) % 400), favouritesCount: (i * 7) % 30,
      createdAt: created,
    });
    made++;
    (photosByTop[it.top] ||= []).push(urls[0]);
    if (made % 10 === 0) console.log(`  saved ${made}`);
  }

  // 6) test ads for qasai bookings and qurbani shares
  async function testAd(o: { top: string; type: string; title: string; description: string; city: string; area: string; price: number; specs: Record<string, any>; photo?: string; featured?: boolean }, i: number) {
    const leaf: any = cats.get(`${o.top}/${seg(o.type)}`) || cats.get(o.top);
    const topCat: any = cats.get(o.top);
    const city = cityByName.get(o.city.toLowerCase());
    if (!leaf || !topCat || !city || !o.photo) return false;
    const area = o.area ? (areaByCity.get(String(city._id)) || []).find((a) => a.name.toLowerCase() === o.area.toLowerCase()) : null;
    const seller: any = sellerFor(o.city, i);
    const _id = new mongoose.Types.ObjectId();
    await Listing.create({
      _id, name: o.title, slug: `${seg(o.title).slice(0, 70)}-${String(_id).slice(-6)}`, description: o.description,
      price: o.price, priceMode: topCat.priceMode === "fixed" ? "fixed" : "negotiable", currency: "PKR",
      mainImage: o.photo, galleryImages: [o.photo],
      address: area ? `${area.name}, ${city.name}` : o.area ? `${o.area}, ${city.name}` : city.name,
      city: city.name, state: city.stateName || undefined, country: "Pakistan",
      location: { type: "Point", coordinates: [(area || city).longitude || 0, (area || city).latitude || 0] },
      locationRefs: { cityId: city._id, areaId: area?._id || null, stateId: city.stateId || null },
      userId: seller._id, categoryId: leaf._id, allCategoryIds: [String(topCat._id), ...(leaf !== topCat ? [String(leaf._id)] : [])],
      status: "approved", condition: null, isFeatured: !!o.featured, featuredExpiresAt: o.featured ? new Date(Date.now() + 14 * 864e5) : null,
      customFieldValues: o.specs, isDemo: true, clicks: 40 + i * 13, favouritesCount: 3 + i, createdAt: since(1 + i),
    });
    return true;
  }
  const pick = (top: string, i: number) => { const l = photosByTop[top] || photosByTop["gaye-bail"] || []; return l.length ? l[i % l.length] : undefined; };
  for (const [i, s] of SERVICE_ADS.entries()) {
    const specs: Record<string, any> = {
      services: ["Zabah (slaughter)", "Cutting & qeema", "Packing", "Home service", "Big animals", "Small animals"],
      available_days: i === 3 ? ["Before Eid", "Eid day 1", "Eid day 2", "Eid day 3"] : ["Eid day 1", "Eid day 2", "Eid day 3"],
      price_basis: "Per animal", rate_small: s.rates[0], rate_large: s.rates[1], daily_capacity: s.cap,
      ...(s.rates[2] ? { rate_camel: s.rates[2] } : {}),
    };
    if (await testAd({ top: "qasai-services", type: "Qasai", title: s.title, description: s.description, city: s.city, area: s.area, price: s.rates[0], specs, photo: pick("gaye-bail", i + 3), featured: i === 0 }, i)) made++;
  }
  for (const [i, s] of SHARE_ADS.entries()) {
    const camel = s.animal === "Camel";
    const specs = { share_animal: s.animal, shares_total: 7, shares_left: s.left, qurbani_day: s.day,
      share_includes: ["Cutting & packing", "Meat home delivery", "Video of the qurbani", ...(i % 2 ? ["Choose the animal"] : [])] };
    const description = `${camel ? "A healthy camel" : "A healthy, be-aib animal"} of qurbani age, shared by 7 people. One share is Rs ${s.price.toLocaleString("en-US")}. `
      + `Qurbani on ${s.day}; meat is cut, packed and delivered to your home the same day. Give the names for the niyyat when you book. Visit the animal any time before Eid.`;
    if (await testAd({ top: "qurbani-hissay", type: camel ? "Oont ka Hissa" : "Gaye ka Hissa", title: s.title, description, city: s.city, area: s.area, price: s.price, specs,
      photo: pick(camel ? "oont" : "gaye-bail", i), featured: i === 0 }, i)) made++;
  }

  // 7) counts the archive pages read
  for (const c of cityById.values()) {
    await City.updateOne({ _id: c._id }, { $set: { listingCount: await Listing.countDocuments({ "locationRefs.cityId": c._id, status: "approved" }) } });
  }
  await refreshScopeCounts().catch(() => {});
  console.log(`done: ${made} demo ads from OLX`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
