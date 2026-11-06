import type { Vertical } from "./types";

/**
 * Bakra Mandi: qurbani animals for Eid ul Adha (Pakistan) — goats, sheep and
 * dumbay, cows and bulls, camels and buffalo, plus qurbani shares (hissay),
 * qasai (butchers) and feed. The site revolves around one event, so the home
 * page counts down to it (`event`, editable in Admin → Settings → Homepage).
 */
export const bakra: Vertical = {
  id: "bakra",
  noun: { one: "animal", many: "animals", One: "Animal", Many: "Animals" },
  primaryTop: "bakray",
  brandWord: { one: "breed", many: "breeds" },
  listingType: "item",
  event: {
    name: "Eid ul Adha",
    // 10 Dhul Hijjah 1448 — expected 16 May 2027 in Pakistan (moon sighting decides; the admin updates it).
    date: "2027-05-16",
    note: "Expected date — final after the Ruet-e-Hilal Committee's moon sighting.",
  },
  subLabels: { "qasai-services": "service", "qurbani-hissay": "type", "chara-saman": "item" },
  bookings: {
    service: {
      tops: ["qasai-services"],
      cta: "Book now",
      title: "Book a qasai",
      units: [
        { key: "small", label: "Bakra / Dumba", rateField: "rate_small" },
        { key: "large", label: "Gaye / Bail / Bhains", rateField: "rate_large" },
        { key: "camel", label: "Oont", rateField: "rate_camel" },
      ],
      capacityField: "daily_capacity",
      daysField: "available_days",
      days: [
        { key: "before", label: "Before Eid", pickDate: true },
        { key: "eid1", label: "Eid day 1", offset: 0 },
        { key: "eid2", label: "Eid day 2", offset: 1 },
        { key: "eid3", label: "Eid day 3", offset: 2 },
      ],
      slots: [
        { key: "early", label: "Early — right after Eid prayer" },
        { key: "morning", label: "Morning (9 am – 12 pm)" },
        { key: "afternoon", label: "Afternoon (12 – 4 pm)" },
        { key: "evening", label: "Evening (after 4 pm)" },
      ],
      note: "Nothing is paid now. The provider confirms the time, and you pay them in person after the work is done.",
    },
    share: {
      tops: ["qurbani-hissay"],
      cta: "Book hissa",
      title: "Book a hissa",
      totalField: "shares_total",
      leftField: "shares_left",
      dayField: "qurbani_day",
      days: [
        { key: "eid1", label: "Eid day 1", offset: 0 },
        { key: "eid2", label: "Eid day 2", offset: 1 },
        { key: "eid3", label: "Eid day 3", offset: 2 },
      ],
      maxPerBooking: 7,
      namesLabel: "Names for the niyyat",
      note: "Your shares are held while the organiser confirms. Pay the organiser directly — never before you've seen the animal or its video and weight.",
    },
  },
  defaults: {
    siteName: "Bakra Mandi",
    tagline: "Pakistan's online mandi for qurbani animals",
    heroTitle: "Find your qurbani animal near you",
    heroSubtitle: "Bakray, dumbay, gaye, bail and oont from farms and mandis across Pakistan — with teeth, weight and price on every ad.",
    searchPlaceholder: "Beetal bakra, Sahiwal bail, Kajli dumba…",
    metaKeywords: [
      "bakra mandi", "qurbani animals Pakistan", "bakra for sale", "goats for sale Pakistan", "cow for qurbani",
      "bail for sale", "dumba for sale", "oont for qurbani", "Eid ul Adha 2027", "online cattle market Pakistan",
      "Beetal bakra", "Sahiwal bail", "qurbani hissa",
    ],
    brandColor: "#15803d",
  },
  copy: {
    sellCta: "Sell your animal",
    browseAll: "Browse all animals",
    everythingLabel: "Qurbani animals",
    inCityLabel: "Qurbani animals",
    titleHint: "Breed, animal and what makes it stand out — the way buyers search.",
    titlePlaceholder: "e.g. Beetal bakra, 2 dant, 45 kg — Faisalabad",
    modelNotListed: "Breed not listed? Type it (e.g. Nukri Beetal)",
    videoHint: "A short video of the animal walking and standing — buyers want to see it move.",
    descriptionPlaceholder: "Age and teeth, live weight, health and feed, vaccination, whether you'll keep it until Eid, delivery…",
    inspectTip: "See the animal in person: check its teeth (age), eyes, horns, ears and how it walks before you pay.",
    subPicker: "Which breed?",
    searchHint: "Search bakray, gaye, oont and breeds",
    safetyNote: "Never send an advance or booking payment. See the animal at the farm or mandi in daylight, and check its teeth and health before you pay.",
    catalogue: "Animals and breeds, the big mandis",
  },
  trust: [
    { icon: "badge", title: "Verified sellers", sub: "CNIC-checked" },
    { icon: "teeth", title: "Teeth & weight", sub: "On every ad" },
    { icon: "chat", title: "Direct contact", sub: "WhatsApp & chat" },
  ],
  icon: "goat",
  placeholderImage: "/placeholders/animal.svg",
  cardSpecs: [
    { field: "teeth", icon: "teeth", label: "Teeth" },
    { field: "weight_kg", icon: "weight", label: "Weight", format: "kg" },
    { field: "age", icon: "calendar", label: "Age" },
    { field: "gender", icon: "gender", label: "Gender" },
    { field: "shares_left", icon: "shares", label: "Shares left", suffix: "shares left" },
  ],
  keySpecs: [
    { field: "teeth", icon: "teeth", label: "Teeth (dant)" },
    { field: "age", icon: "calendar", label: "Age" },
    { field: "weight_kg", icon: "weight", label: "Live weight", format: "kg" },
    { field: "height_in", icon: "height", label: "Height", format: "inch" },
    { field: "gender", icon: "gender", label: "Gender" },
    { field: "colour", icon: "colour", label: "Colour" },
    { field: "kept_at", icon: "farm", label: "Kept at" },
    { field: "share_animal", icon: "shares", label: "Share in" },
    { field: "shares_left", icon: "shares", label: "Shares left" },
    { field: "qurbani_day", icon: "moon", label: "Qurbani day" },
  ],
  featureFields: ["highlights", "share_includes", "services"],
  titleFields: ["teeth"],
  searchAliases: {
    // goats
    bakra: "bakray", bakray: "bakray", bakre: "bakray", bakri: "bakray", bakriyan: "bakray", goat: "bakray", goats: "bakray",
    beetal: "bakray/beetal", "makhi cheeni": "bakray/makhi-cheeni", rajanpuri: "bakray/rajanpuri", teddy: "bakray/teddy", tedi: "bakray/teddy",
    kamori: "bakray/kamori", barbari: "bakray/barbari", nachi: "bakray/nachi", pateri: "bakray/pateri", gulabi: "bakray/gulabi",
    // sheep
    dumba: "dumbay-chatray", dumbay: "dumbay-chatray", dumbe: "dumbay-chatray", chatra: "dumbay-chatray", chatray: "dumbay-chatray",
    chhatra: "dumbay-chatray", bheir: "dumbay-chatray", bhed: "dumbay-chatray", sheep: "dumbay-chatray", kajli: "dumbay-chatray/kajli",
    lohi: "dumbay-chatray/lohi", "afghani dumba": "dumbay-chatray/afghani-dumba", balochi: "dumbay-chatray/balochi",
    // cattle
    gaye: "gaye-bail", gai: "gaye-bail", gaey: "gaye-bail", cow: "gaye-bail", cows: "gaye-bail", bail: "gaye-bail", bull: "gaye-bail",
    bulls: "gaye-bail", bachra: "gaye-bail", bachhra: "gaye-bail", wacha: "gaye-bail", vacha: "gaye-bail", cattle: "gaye-bail",
    sahiwal: "gaye-bail/sahiwal", cholistani: "gaye-bail/cholistani", "red sindhi": "gaye-bail/red-sindhi", dhanni: "gaye-bail/dhanni",
    tharparkar: "gaye-bail/tharparkar", bhagnari: "gaye-bail/bhagnari", australian: "gaye-bail/australian-cross", brahman: "gaye-bail/brahman",
    // camels & buffalo
    oont: "oont", unt: "oont", untt: "oont", camel: "oont", camels: "oont",
    bhains: "bhains-katta", bhens: "bhains-katta", buffalo: "bhains-katta", katta: "bhains-katta", kattay: "bhains-katta",
    // shares, services, feed
    hissa: "qurbani-hissay", hissay: "qurbani-hissay", share: "qurbani-hissay", shares: "qurbani-hissay",
    "ijtimai qurbani": "qurbani-hissay", "collective qurbani": "qurbani-hissay",
    qasai: "qasai-services", qassai: "qasai-services", butcher: "qasai-services", butchers: "qasai-services",
    chara: "chara-saman", fodder: "chara-saman", wanda: "chara-saman", ghungroo: "chara-saman",
  },
  priceFloor: {
    bakray: 15_000, "dumbay-chatray": 15_000, "gaye-bail": 60_000, oont: 120_000, "bhains-katta": 60_000,
    "qurbani-hissay": 8_000, "qasai-services": 500, "chara-saman": 50,
  },
  moderation: {
    sells: "a Pakistani online bakra mandi for Eid ul Adha (qurbani goats, sheep and dumbay, cows and bulls, camels and buffalo; qurbani shares; qasai services; feed and accessories)",
    scamHints: [
      "Advance, 'booking' or 'token' payment demanded before the buyer has seen the animal, or 'we deliver from another city after payment'",
      "Photos of a different, bigger or healthier animal than the one sold; live weight exaggerated",
      "Under-age or defective animals sold as 'qurbani ready' (teeth not complete, horn broken from the root, lame, blind in an eye)",
      "'Pure breed' or 'Australian' claims with prices far below the market for that breed",
      "Collective qurbani (hissa) schemes that collect money with no address, no named organiser and no proof of qurbani",
      "Sick animals hidden — ticks (Congo virus risk), lumpy skin disease, fever — or the same animal advertised in many cities",
    ],
  },
  priceStyle: "lakh",
  budgets: [50_000, 80_000, 120_000, 200_000, 350_000, 600_000, 1_000_000],
};
