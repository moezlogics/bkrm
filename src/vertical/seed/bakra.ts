import type { VerticalSeed } from "./types";

/**
 * Bakra Mandi starter data: qurbani animals for Eid ul Adha in Pakistan.
 * Sections are the animals people ask for at a mandi (bakray, dumbay/chatray,
 * gaye/bail, oont, bhains/katta), each split by breed; plus qurbani shares
 * (hissay), qasai and services, and feed/decoration. Fields are what a buyer
 * asks before anything else: teeth (dant = age), live weight, gender.
 */

const SMALL = ["bakray", "dumbay-chatray"];
const BIG = ["gaye-bail", "oont", "bhains-katta"];
const ANIMALS = [...SMALL, ...BIG];

const MANDIS = [
  "Sohrab Goth / Super Highway Mandi (Karachi)", "Malir Bakra Piri (Karachi)", "Lyari Bakra Piri (Karachi)",
  "Shahpur Kanjran Mandi (Lahore)", "Saggian Mandi (Lahore)", "Township Mandi (Lahore)", "Kalashah Kaku Mandi (Lahore)", "Kasur Mandi",
  "I-12 Mandi (Islamabad)", "Other mandi",
];

export const bakraSeed: VerticalSeed = {
  tops: [
    {
      slug: "bakray", name: "Bakray", icon: "goat", sequence: 1, priceMode: "negotiable", conditions: [],
      types: ["Beetal", "Makhi Cheeni", "Rajanpuri", "Teddy", "Kamori", "Barbari", "Nachi", "Pateri", "Dera Din Panah", "Gulabi", "Lehri", "Kaghani", "Desi / Other"],
    },
    {
      slug: "dumbay-chatray", name: "Dumbay & Chatray", icon: "sheep", sequence: 2, priceMode: "negotiable", conditions: [],
      types: ["Afghani Dumba", "Balochi", "Kajli", "Lohi", "Kachhi", "Thalli", "Rakhshani", "Hashtnagri", "Damani", "Desi / Other"],
    },
    {
      slug: "gaye-bail", name: "Gaye & Bail", icon: "cow", sequence: 3, priceMode: "negotiable", conditions: [],
      types: ["Sahiwal", "Cholistani", "Red Sindhi", "Tharparkar", "Dhanni", "Bhagnari", "Lohani", "Dajal", "Achai", "Australian Cross", "Brahman", "Desi / Other"],
    },
    { slug: "oont", name: "Oont", icon: "camel", sequence: 4, priceMode: "negotiable", conditions: [], types: ["Marecha", "Barela", "Brahvi", "Kohi", "Thari", "Desi / Other"] },
    { slug: "bhains-katta", name: "Bhains & Katta", icon: "buffalo", sequence: 5, priceMode: "negotiable", conditions: [], types: ["Nili-Ravi", "Kundi", "Azi Kheli", "Desi / Other"] },
    {
      slug: "qurbani-hissay", name: "Qurbani Hissay", icon: "shares", sequence: 6, priceMode: "fixed", conditions: [],
      types: ["Gaye ka Hissa", "Oont ka Hissa", "Ijtimai Qurbani Package"],
    },
    {
      slug: "qasai-services", name: "Qasai & Services", icon: "butcher", sequence: 7, priceMode: "negotiable", conditions: [],
      types: ["Qasai", "Rakhwali until Eid", "Transport & Pickup", "Cutting & Packing", "Vet & Doctor"],
    },
    {
      slug: "chara-saman", name: "Chara & Saman", icon: "feed", sequence: 8, priceMode: "fixed", conditions: [],
      types: ["Chara & Wanda", "Sajawat (Ghungroo, Mala)", "Rassi & Khoonta", "Shed & Tent", "Chhuri & Tools"],
    },
  ],

  fields: [
    // Age & size — what a buyer asks first
    { name: "Teeth (dant)", slug: "teeth", type: "dropdown", tops: ANIMALS, sequence: 1, required: true, filterable: true, group: "Age & size",
      values: ["Kheera (milk teeth)", "2 Dant", "4 Dant", "6 Dant", "Full mouth (8 dant)"],
      helpText: "Do dant (2 permanent front teeth) usually means the animal has reached qurbani age." },
    { name: "Age", slug: "age", type: "dropdown", tops: ANIMALS, sequence: 2, filterable: true, group: "Age & size",
      values: ["Under 1 year", "1 year", "1.5 years", "2 years", "2.5 years", "3 years", "4 years", "5 years", "6+ years"] },
    { name: "Live weight", slug: "weight_kg", type: "number", tops: ANIMALS, sequence: 3, filterable: true, unit: "kg", min: 5, max: 1500, group: "Age & size",
      placeholder: "e.g. 45", helpText: "Weight of the live animal. 1 maund (man) = 40 kg." },
    { name: "Height", slug: "height_in", type: "number", tops: ANIMALS, sequence: 4, filterable: true, unit: "inches", min: 10, max: 90, group: "Age & size",
      placeholder: "e.g. 36", helpText: "At the shoulder." },
    // Details
    { name: "Gender", slug: "gender", type: "dropdown", tops: ANIMALS, sequence: 5, required: true, filterable: true, group: "Details",
      values: ["Male", "Khassi (castrated)", "Female"] },
    { name: "Colour", slug: "colour", type: "dropdown", tops: ANIMALS, sequence: 6, filterable: true, allowCustom: true, group: "Details",
      values: ["White", "Black", "Brown", "Golden", "Red", "Grey", "Black & White", "Brown & White", "Spotted (cheeni)", "Mixed"] },
    { name: "Animals in this ad", slug: "quantity", type: "number", tops: ANIMALS, sequence: 7, min: 1, max: 500, group: "Details",
      placeholder: "1", helpText: "Selling a pair or a herd? The price is per animal unless the title says otherwise." },
    { name: "Price per kg (live)", slug: "price_per_kg", type: "number", tops: ANIMALS, sequence: 8, unit: "Rs/kg", min: 100, max: 5000, group: "Details",
      placeholder: "e.g. 1100", helpText: "Only if you sell by live weight." },
    // Where & delivery
    { name: "Kept at", slug: "kept_at", type: "dropdown", tops: ANIMALS, sequence: 9, filterable: true, group: "Where & delivery", values: ["Farm", "Home", "Mandi"] },
    { name: "Mandi", slug: "mandi", type: "dropdown", tops: ANIMALS, sequence: 10, filterable: true, allowCustom: true, group: "Where & delivery", values: MANDIS,
      helpText: "Only if the animal is at a mandi — which one?" },
    { name: "Delivery", slug: "delivery", type: "dropdown", tops: [...ANIMALS, "chara-saman"], sequence: 11, filterable: true, group: "Where & delivery",
      values: ["Home delivery available", "Pickup only"] },
    { name: "Highlights", slug: "highlights", type: "multiselect", tops: ANIMALS, sequence: 12, group: "Highlights",
      values: ["Qurbani age complete", "No defect (be-aib)", "Vaccinated", "Dewormed", "Tick-free", "Desi feed", "Kept until Eid (rakhwali)", "Weighed on scale", "Show quality", "Pair available"] },
    // Qurbani shares
    { name: "Share in", slug: "share_animal", type: "dropdown", tops: ["qurbani-hissay"], sequence: 1, required: true, filterable: true, group: "Share", values: ["Cow / Bull", "Camel", "Buffalo"] },
    { name: "Total shares", slug: "shares_total", type: "number", tops: ["qurbani-hissay"], sequence: 2, min: 1, max: 7, group: "Share", placeholder: "7",
      helpText: "A cow, bull, buffalo or camel can be shared by up to seven people." },
    { name: "Shares left", slug: "shares_left", type: "number", tops: ["qurbani-hissay"], sequence: 3, required: true, filterable: true, min: 0, max: 7, group: "Share", placeholder: "e.g. 3" },
    { name: "Qurbani day", slug: "qurbani_day", type: "dropdown", tops: ["qurbani-hissay"], sequence: 4, filterable: true, group: "Share", values: ["Eid day 1", "Eid day 2", "Eid day 3"] },
    { name: "Included", slug: "share_includes", type: "multiselect", tops: ["qurbani-hissay"], sequence: 5, group: "Share",
      values: ["Meat home delivery", "Cutting & packing", "Video of the qurbani", "Skin given to charity", "Choose the animal", "Weight shown before Eid"] },
    // Services
    { name: "Services", slug: "services", type: "multiselect", tops: ["qasai-services"], sequence: 1, group: "Services",
      values: ["Zabah (slaughter)", "Cutting & qeema", "Packing", "Home service", "Big animals", "Small animals", "Rakhwali until Eid", "Transport"] },
    { name: "Available", slug: "available_days", type: "multiselect", tops: ["qasai-services"], sequence: 2, filterable: true, group: "Services",
      values: ["Before Eid", "Eid day 1", "Eid day 2", "Eid day 3"] },
    { name: "Price is", slug: "price_basis", type: "dropdown", tops: ["qasai-services", "chara-saman"], sequence: 3, group: "Pricing",
      values: ["Per animal", "Per kg", "Per maund", "Per day", "Per trip", "Per piece", "Package"] },
    // Booking: what a customer pays per animal, and how many a team can do in a day.
    { name: "Rate: bakra / dumba", slug: "rate_small", type: "number", tops: ["qasai-services"], sequence: 4, unit: "Rs", min: 0, max: 100000, group: "Rates for booking",
      placeholder: "e.g. 4000", helpText: "Per animal. Leave empty if you don't take small animals." },
    { name: "Rate: gaye / bail / bhains", slug: "rate_large", type: "number", tops: ["qasai-services"], sequence: 5, unit: "Rs", min: 0, max: 300000, group: "Rates for booking",
      placeholder: "e.g. 12000", helpText: "Per animal. Leave empty if you don't take big animals." },
    { name: "Rate: oont", slug: "rate_camel", type: "number", tops: ["qasai-services"], sequence: 6, unit: "Rs", min: 0, max: 500000, group: "Rates for booking",
      placeholder: "e.g. 25000" },
    { name: "Animals per day", slug: "daily_capacity", type: "number", tops: ["qasai-services"], sequence: 7, min: 1, max: 300, group: "Rates for booking",
      placeholder: "e.g. 15", helpText: "How many animals you can take in one day. When a day is full, it stops taking bookings." },
  ],

  places: {
    states: [{ name: "Balochistan", slug: "balochistan", order: 5 }],
    cities: [
      { name: "Quetta", slug: "quetta", state: "Balochistan", lat: 30.1798, lng: 66.975, order: 11 },
      { name: "Bahawalpur", slug: "bahawalpur", state: "Punjab", lat: 29.3956, lng: 71.6836, order: 12 },
      { name: "Sahiwal", slug: "sahiwal", state: "Punjab", lat: 30.6682, lng: 73.1114, order: 13 },
      { name: "Okara", slug: "okara", state: "Punjab", lat: 30.8138, lng: 73.4534, order: 14 },
      { name: "Sargodha", slug: "sargodha", state: "Punjab", lat: 32.074, lng: 72.6861, order: 15 },
      { name: "Dera Ghazi Khan", slug: "dera-ghazi-khan", state: "Punjab", lat: 30.0459, lng: 70.6403, order: 16 },
      { name: "Rajanpur", slug: "rajanpur", state: "Punjab", lat: 29.1044, lng: 70.3301, order: 17 },
      { name: "Rahim Yar Khan", slug: "rahim-yar-khan", state: "Punjab", lat: 28.4202, lng: 70.2952, order: 18 },
      { name: "Jhang", slug: "jhang", state: "Punjab", lat: 31.2681, lng: 72.3181, order: 19 },
      { name: "Kasur", slug: "kasur", state: "Punjab", lat: 31.1187, lng: 74.4507, order: 20 },
      { name: "Sheikhupura", slug: "sheikhupura", state: "Punjab", lat: 31.7167, lng: 73.985, order: 21 },
      { name: "Chakwal", slug: "chakwal", state: "Punjab", lat: 32.9328, lng: 72.863, order: 22 },
      { name: "Sukkur", slug: "sukkur", state: "Sindh", lat: 27.7052, lng: 68.8574, order: 23 },
      { name: "Larkana", slug: "larkana", state: "Sindh", lat: 27.557, lng: 68.2264, order: 24 },
      { name: "Mirpur Khas", slug: "mirpur-khas", state: "Sindh", lat: 25.5276, lng: 69.0111, order: 25 },
      { name: "Mithi (Tharparkar)", slug: "mithi", state: "Sindh", lat: 24.736, lng: 69.7971, order: 26 },
      { name: "Mardan", slug: "mardan", state: "Khyber Pakhtunkhwa", lat: 34.1986, lng: 72.0404, order: 27 },
      { name: "Dera Ismail Khan", slug: "dera-ismail-khan", state: "Khyber Pakhtunkhwa", lat: 31.8314, lng: 70.9019, order: 28 },
    ],
    // The big Eid cattle markets, so buyers can browse a mandi like an area.
    areas: {
      Karachi: [
        { name: "Sohrab Goth Mandi (Super Highway)", slug: "sohrab-goth-mandi", lat: 24.955, lng: 67.165 },
        { name: "Malir Bakra Piri", slug: "malir-bakra-piri", lat: 24.893, lng: 67.205 },
        { name: "Lyari Bakra Piri", slug: "lyari-bakra-piri", lat: 24.865, lng: 66.995 },
      ],
      Lahore: [
        { name: "Shahpur Kanjran Mandi", slug: "shahpur-kanjran-mandi", lat: 31.42, lng: 74.18 },
        { name: "Saggian Mandi", slug: "saggian-mandi", lat: 31.62, lng: 74.27 },
        { name: "Township Mandi", slug: "township-mandi", lat: 31.45, lng: 74.31 },
      ],
      Islamabad: [{ name: "I-12 Mandi", slug: "i-12-mandi", lat: 33.63, lng: 72.98 }],
    },
  },

  pages: {
    about: "<p>{site} is an online bakra mandi for Eid ul Adha: qurbani bakray, dumbay, gaye, bail, oont and bhains from farms, homes and mandis across Pakistan — with teeth, live weight and price on every ad, verified sellers and direct contact. Qurbani shares (hissay), qasai and feed are here too.</p>",
    howItWorks: "<h2>Selling</h2><ul><li>Tap <b>Sell your animal</b> and choose the animal and breed</li><li>Add clear photos (side, face and teeth), the teeth, live weight and gender, and your price</li><li>Buyers call, WhatsApp or chat with you — agree a time to see the animal</li></ul><h2>Buying</h2><ul><li>Browse by animal, breed, city, mandi or budget</li><li>Ask for a video and the teeth photo, then see the animal in person</li><li>Check its age and health, weigh it if you buy by weight, then pay</li></ul>",
    safety: "<ul><li><strong>Never send an advance, booking or token payment</strong> for an animal you haven't seen.</li><li>See the animal in daylight at the farm or mandi: check the teeth, eyes, horns, ears and how it walks.</li><li>Buying by weight? Weigh it on a scale in front of you.</li><li>For a qurbani share (hissa), deal with an organiser you can visit — ask for the animal, the address and a video of the qurbani.</li><li>Ticks can spread Congo fever: wear full sleeves at the mandi, check the animal for ticks and never crush one with bare hands.</li><li>Prefer verified sellers, and report anything suspicious.</li></ul>",
  },

  plans: [
    { name: "Starter", price: 999, finalPrice: 699, listingLimit: 5, featuredLimit: 1, description: "For a family selling a few animals before Eid.", features: ["5 live ads", "1 featured ad (7 days)", "30 days validity"] },
    { name: "Beopari", price: 2999, finalPrice: 1999, listingLimit: 25, featuredLimit: 5, isPopular: true, description: "For beoparis who bring animals to the mandi every Eid.", features: ["25 live ads", "5 featured ads (7 days each)", "Priority support", "30 days validity"] },
    { name: "Farm & Mandi", price: 7499, finalPrice: 4999, listingLimit: 100, featuredLimit: 20, description: "For farms and mandi traders with a big herd.", features: ["100 live ads", "20 featured ads (7 days each)", "Shop page for your farm", "30 days validity"] },
  ],

  faqs: [
    { question: "Is posting an ad free?", answer: "Yes — your first ad is free. Beoparis and farms with many animals can take a plan for more ads and featured placement.", category: "Selling" },
    { question: "How can I tell an animal's age?", answer: "From its teeth. 'Kheera' means it still has only milk teeth. 'Do dant' — two permanent front teeth — usually means a goat or sheep is about a year old and a cow or buffalo about two. Ask the seller for a clear photo of the teeth, and check them yourself before paying.", category: "Qurbani" },
    { question: "At what age is an animal valid for qurbani?", answer: "As widely followed in Pakistan: a goat or sheep should be at least one year old (many scholars also accept a healthy dumba of six months or more that looks a year old), a cow, bull or buffalo two years, and a camel five years. If you are unsure, ask your local scholar.", category: "Qurbani" },
    { question: "Which defects make an animal unsuitable?", answer: "Commonly listed defects are: blind or blind in one eye, so lame that it can't walk to the place of slaughter, very weak or clearly sick, a large part of an ear or the tail cut off, a horn broken from the root, or most teeth missing. Check these in person — and ask a scholar about anything in between.", category: "Qurbani" },
    { question: "How does a qurbani share (hissa) work?", answer: "A cow, bull, buffalo or camel can be shared by up to seven people, each paying for one share. Choose an organiser you can visit: ask which animal it is, the address, the qurbani day, how the meat reaches you and whether you'll get a video of the qurbani.", category: "Qurbani" },
    { question: "How do I buy safely?", answer: "Never send an advance or 'booking' payment for an animal you haven't seen. Meet at the farm or mandi in daylight, check the animal, weigh it if you buy by weight, and pay only when it is handed over.", category: "Safety" },
    { question: "How do I protect myself from Congo virus at the mandi?", answer: "Congo fever spreads through ticks on animals. Wear full sleeves and closed shoes, check the animal for ticks, don't crush ticks with bare hands, and see a doctor if you get a fever after visiting a mandi or handling animals.", category: "Safety" },
    { question: "Can the seller keep my animal until Eid?", answer: "Many sellers do (rakhwali) — look for 'Kept until Eid' on the ad and agree the feeding, the fee and who is responsible if the animal falls sick, in writing.", category: "Buying" },
    { question: "How do I become a verified seller?", answer: "Add your mobile number and upload your CNIC (front and back) from My account → Seller verification. Once approved, the verified badge shows on all your ads.", category: "Account" },
  ],

  blog: [
    { title: "Buying your qurbani animal: the checklist", slug: "qurbani-animal-buying-checklist", category: "Guides", excerpt: "Teeth, health, weight and a fair price — step by step.",
      content: "<h2>1. Teeth first</h2><p>Look at the front teeth: two permanent teeth (do dant) usually means the animal has reached qurbani age.</p><h2>2. Health</h2><p>Bright eyes, a clean nose, firm walk and a good appetite. Check for ticks and for any wound or limp.</p><h2>3. Weight and price</h2><p>Buying by weight? Weigh it in front of you. Compare a few animals of the same breed and size.</p><h2>4. Pay safely</h2><p>Only when the animal is handed over — never an advance for an animal you haven't seen.</p>" },
    { title: "Teeth and age: is the animal qurbani-ready?", slug: "teeth-and-age-qurbani-ready", category: "Qurbani", excerpt: "What kheera, do dant and chaar dant tell you.",
      content: "<h2>Kheera</h2><p>Only milk teeth — usually too young for qurbani.</p><h2>Do dant (2 teeth)</h2><p>Two permanent front teeth: a goat or sheep is usually around a year old, a cow or buffalo around two.</p><h2>Chaar dant and more</h2><p>Four or more permanent teeth: an older, mature animal.</p><p>When unsure, ask your local scholar.</p>" },
    { title: "Congo virus at Eid: staying safe at the mandi", slug: "congo-virus-eid-safety", category: "Safety", excerpt: "Ticks, gloves and what to do if you get a fever.",
      content: "<h2>Why it matters</h2><p>Congo fever spreads through ticks on animals, and cases rise around Eid.</p><h2>At the mandi</h2><p>Wear full sleeves and closed shoes, and check the animal for ticks before you bring it home.</p><h2>At home</h2><p>Keep the animal's place clean and never crush a tick with bare hands. See a doctor for any fever after handling animals.</p>" },
    { title: "Selling your animals online before Eid", slug: "sell-animals-online-before-eid", category: "Selling", excerpt: "Photos, teeth, weight — and reaching buyers in your city.",
      content: "<h2>Photos</h2><p>Daylight, the full side, the face and a clear photo of the teeth. A short video of the animal walking sells best.</p><h2>Details</h2><p>Breed, teeth, live weight, gender and whether you deliver or keep it until Eid.</p><h2>Price</h2><p>Compare similar animals in your city and mandi.</p>" },
  ],

  reportReasons: [
    "Fake or misleading ad", "Animal already sold", "Asks for advance or booking payment", "Not the real animal / wrong photos",
    "Sick or defective animal hidden", "Hissa / collective qurbani scam", "Offensive or inappropriate content", "Duplicate ad",
  ],

  rails: [
    { title: "Featured animals", filter: "featured" },
    { title: "Beetal bakray", filter: "category", value: "bakray/beetal" },
    { title: "Gaye & bail", filter: "category", value: "gaye-bail" },
    { title: "Qurbani hissay", filter: "category", value: "qurbani-hissay" },
  ],

  demo: [
    { title: "Beetal bakra, 2 dant, 55 kg", top: "bakray", type: "Beetal", price: 165_000, condition: "used", city: "Faisalabad", area: "Jaranwala Road", featured: true, tint: "#f5f5f4",
      specs: { teeth: "2 Dant", age: "1.5 years", weight_kg: 55, height_in: 38, gender: "Male", colour: "White", quantity: 1, kept_at: "Farm", delivery: "Home delivery available", highlights: ["Qurbani age complete", "No defect (be-aib)", "Vaccinated", "Desi feed"] },
      description: "Pure Beetal from our own farm, raised on desi chara and wanda. Tall and healthy, vaccinated and dewormed. Teeth photo on request — come and see him at the farm." },
    { title: "Makhi Cheeni bakray — pair, 2 dant", top: "bakray", type: "Makhi Cheeni", price: 145_000, condition: "used", city: "Lahore", area: "Shahpur Kanjran Mandi", tint: "#d6d3d1",
      specs: { teeth: "2 Dant", age: "1 year", weight_kg: 42, height_in: 34, gender: "Male", colour: "Spotted (cheeni)", quantity: 2, kept_at: "Mandi", mandi: "Shahpur Kanjran Mandi (Lahore)", highlights: ["Qurbani age complete", "Pair available"] },
      description: "Matching Makhi Cheeni pair at Shahpur Kanjran. Price is per bakra. Both have two teeth and are fully healthy." },
    { title: "Rajanpuri Nukra bakra — show quality", top: "bakray", type: "Rajanpuri", price: 650_000, condition: "used", city: "Islamabad", area: "I-12 Mandi", featured: true, tint: "#fafaf9",
      specs: { teeth: "4 Dant", age: "2.5 years", weight_kg: 95, height_in: 44, gender: "Male", colour: "White", quantity: 1, kept_at: "Mandi", mandi: "I-12 Mandi (Islamabad)", highlights: ["Qurbani age complete", "No defect (be-aib)", "Show quality", "Weighed on scale"] },
      description: "Tall white Rajanpuri Nukra with pink ears, raised for Eid. 95 kg on the scale. Serious buyers can see him at I-12." },
    { title: "Teddy bakra, 2 dant", top: "bakray", type: "Teddy", price: 75_000, condition: "used", city: "Karachi", area: "Malir Bakra Piri", tint: "#57534e",
      specs: { teeth: "2 Dant", age: "1 year", weight_kg: 30, height_in: 26, gender: "Khassi (castrated)", colour: "Black", quantity: 1, kept_at: "Mandi", mandi: "Malir Bakra Piri (Karachi)", highlights: ["Qurbani age complete", "Tick-free"] },
      description: "Healthy Teddy khassi, good meat, active and eating well. Available at Malir Bakra Piri." },
    { title: "Kamori bakra, long ears, 2 dant", top: "bakray", type: "Kamori", price: 140_000, condition: "used", city: "Hyderabad", area: "Latifabad", tint: "#92400e",
      specs: { teeth: "2 Dant", age: "1.5 years", weight_kg: 48, height_in: 36, gender: "Male", colour: "Brown", quantity: 1, kept_at: "Home", delivery: "Home delivery available", highlights: ["Qurbani age complete", "Kept until Eid (rakhwali)"] },
      description: "Home-raised Kamori with the long ears Kamori is known for. Can keep him until Eid and deliver in Hyderabad." },
    { title: "Desi bakra 2 dant — budget", top: "bakray", type: "Desi / Other", price: 68_000, condition: "used", city: "Multan", area: "Bosan Road", tint: "#78716c",
      specs: { teeth: "2 Dant", age: "1 year", weight_kg: 32, gender: "Male", colour: "Brown & White", quantity: 1, kept_at: "Home", highlights: ["Qurbani age complete"] },
      description: "Healthy desi bakra at a fair price. Teeth complete, no defect." },
    { title: "Afghani dumba, 2 dant, 62 kg", top: "dumbay-chatray", type: "Afghani Dumba", price: 185_000, condition: "used", city: "Quetta", featured: true, tint: "#e7e5e4",
      specs: { teeth: "2 Dant", age: "1.5 years", weight_kg: 62, gender: "Male", colour: "White", quantity: 1, kept_at: "Farm", highlights: ["Qurbani age complete", "No defect (be-aib)", "Weighed on scale"] },
      description: "Heavy Afghani dumba with a big tail, from our farm near Quetta. Weighed 62 kg." },
    { title: "Kajli chatra, 2 dant", top: "dumbay-chatray", type: "Kajli", price: 115_000, condition: "used", city: "Sargodha", tint: "#f5f5f4",
      specs: { teeth: "2 Dant", age: "1 year", weight_kg: 50, height_in: 34, gender: "Male", colour: "White", quantity: 1, kept_at: "Farm", highlights: ["Qurbani age complete", "Vaccinated"] },
      description: "Tall Kajli chatra with the Roman nose Kajli is known for. Vaccinated, healthy." },
    { title: "Sahiwal bail, 4 dant, 380 kg", top: "gaye-bail", type: "Sahiwal", price: 420_000, condition: "used", city: "Sahiwal", featured: true, tint: "#b45309",
      specs: { teeth: "4 Dant", age: "3 years", weight_kg: 380, gender: "Male", colour: "Red", quantity: 1, kept_at: "Farm", delivery: "Home delivery available", price_per_kg: 1100, highlights: ["Qurbani age complete", "No defect (be-aib)", "Vaccinated", "Weighed on scale"] },
      description: "Pure Sahiwal bail from our farm, 380 kg on the scale. Delivery to Lahore and Okara can be arranged." },
    { title: "Cholistani bail — 520 kg", top: "gaye-bail", type: "Cholistani", price: 560_000, condition: "used", city: "Bahawalpur", tint: "#e7e5e4",
      specs: { teeth: "4 Dant", age: "3 years", weight_kg: 520, gender: "Male", colour: "Spotted (cheeni)", quantity: 1, kept_at: "Farm", highlights: ["Qurbani age complete", "Show quality", "Weighed on scale"] },
      description: "Big spotted Cholistani bail raised in the Cholistan area. Calm and healthy." },
    { title: "Australian cross bachhra, 2 dant", top: "gaye-bail", type: "Australian Cross", price: 330_000, condition: "used", city: "Karachi", area: "Sohrab Goth Mandi (Super Highway)", tint: "#1c1917",
      specs: { teeth: "2 Dant", age: "2 years", weight_kg: 300, gender: "Male", colour: "Black & White", quantity: 1, kept_at: "Mandi", mandi: "Sohrab Goth / Super Highway Mandi (Karachi)", highlights: ["Qurbani age complete", "Tick-free"] },
      description: "Healthy cross-bred bachhra at the Super Highway mandi, block 5. Two teeth, 300 kg." },
    { title: "Desi gaye, 2 dant", top: "gaye-bail", type: "Desi / Other", price: 245_000, condition: "used", city: "Peshawar", area: "Warsak Road", tint: "#a8a29e",
      specs: { teeth: "2 Dant", age: "2 years", weight_kg: 260, gender: "Female", colour: "Brown", quantity: 1, kept_at: "Home", highlights: ["Qurbani age complete", "No defect (be-aib)"] },
      description: "Healthy desi gaye, home-raised. Two teeth, no defect." },
    { title: "Marecha oont, 6 years", top: "oont", type: "Marecha", price: 780_000, condition: "used", city: "Karachi", area: "Malir Cantt", featured: true, tint: "#d6b98c",
      specs: { teeth: "Full mouth (8 dant)", age: "6+ years", weight_kg: 520, height_in: 80, gender: "Male", colour: "Golden", quantity: 1, kept_at: "Farm", highlights: ["Qurbani age complete", "No defect (be-aib)"] },
      description: "Strong Marecha oont from Thar, over six years old. Good for a family qurbani or shares." },
    { title: "Nili-Ravi katta, 2 dant", top: "bhains-katta", type: "Nili-Ravi", price: 310_000, condition: "used", city: "Gujranwala", area: "Rahwali Cantt", tint: "#292524",
      specs: { teeth: "2 Dant", age: "2 years", weight_kg: 330, gender: "Male", colour: "Black", quantity: 1, kept_at: "Farm", highlights: ["Qurbani age complete", "Vaccinated"] },
      description: "Healthy Nili-Ravi katta with the white markings of the breed. Two teeth." },
    { title: "Gaye ka hissa — Eid day 1, 3 shares left", top: "qurbani-hissay", type: "Gaye ka Hissa", price: 32_000, condition: "used", city: "Karachi", area: "Gulshan-e-Iqbal", featured: true, tint: "#b45309",
      specs: { share_animal: "Cow / Bull", shares_total: 7, shares_left: 3, qurbani_day: "Eid day 1", share_includes: ["Meat home delivery", "Cutting & packing", "Video of the qurbani", "Skin given to charity"] },
      description: "One share in a healthy 2-dant bail (photos and weight sent before Eid). Qurbani on the first day, meat delivered packed to your home in Gulshan and nearby areas." },
    { title: "Qasai team for Eid — big & small animals", top: "qasai-services", type: "Qasai", price: 4_000, condition: "used", city: "Lahore", area: "Johar Town", tint: "#475569",
      specs: { services: ["Zabah (slaughter)", "Cutting & qeema", "Packing", "Home service", "Big animals", "Small animals"], available_days: ["Eid day 1", "Eid day 2", "Eid day 3"], price_basis: "Per animal", rate_small: 4000, rate_large: 12000, daily_capacity: 14 },
      description: "Experienced qasai team of four. Rs 12,000 for a bail or gaye, Rs 4,000 for a bakra — cutting and packing included. Book early for the first day." },
    { title: "Karachi qasai — home service, all three days", top: "qasai-services", type: "Qasai", price: 5_000, condition: "used", city: "Karachi", area: "Gulshan-e-Iqbal", featured: true, tint: "#334155",
      specs: { services: ["Zabah (slaughter)", "Cutting & qeema", "Packing", "Home service", "Big animals", "Small animals"], available_days: ["Eid day 1", "Eid day 2", "Eid day 3"], price_basis: "Per animal", rate_small: 5000, rate_large: 15000, rate_camel: 30000, daily_capacity: 20 },
      description: "Ustad Bashir and team, 20 years in Gulshan, Johar and PECHS. We come to your home with our own tools, clean up after, and pack the meat in bags for three parts. Camels on day 2 and 3 only." },
    { title: "Oont ka hissa — Eid day 2, 4 shares left", top: "qurbani-hissay", type: "Oont ka Hissa", price: 45_000, condition: "used", city: "Lahore", area: "DHA", tint: "#92400e",
      specs: { share_animal: "Camel", shares_total: 7, shares_left: 4, qurbani_day: "Eid day 2", share_includes: ["Meat home delivery", "Cutting & packing", "Video of the qurbani", "Choose the animal"] },
      description: "A healthy Marecha camel from Cholistan, at our farm near Bedian Road — visit before Eid. Qurbani on the second day, meat packed and delivered in DHA, Cantt and Gulberg." },
    { title: "Islamabad cutting & packing — qeema and boti", top: "qasai-services", type: "Cutting & Packing", price: 3_500, condition: "used", city: "Islamabad", area: "G-11", tint: "#475569",
      specs: { services: ["Cutting & qeema", "Packing", "Home service", "Small animals", "Big animals"], available_days: ["Eid day 1", "Eid day 2", "Eid day 3"], price_basis: "Per animal", rate_small: 3500, rate_large: 9000, daily_capacity: 10 },
      description: "After the zabah, we do the cutting, qeema and vacuum packing at your home. Freezer-ready bags, labelled." },
    { title: "Fresh chara + wanda for qurbani animals", top: "chara-saman", type: "Chara & Wanda", price: 1_800, condition: "used", city: "Faisalabad", area: "Madina Town", tint: "#65a30d",
      specs: { price_basis: "Per maund", delivery: "Home delivery available" },
      description: "Fresh green chara and wanda, delivered every morning until Eid. Price per maund." },
  ],
};
