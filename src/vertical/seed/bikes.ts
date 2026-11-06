import type { VerticalSeed } from "./types";

const YEAR_MAX = new Date().getFullYear() + 1;
const REG = ["Islamabad", "Lahore", "Karachi", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan", "Azad Kashmir", "Un-Registered"];
const PETROL_TOPS = ["motorcycles", "scooters"];
const ALL_BIKES = ["motorcycles", "scooters", "electric-bikes"];

export const bikesSeed: VerticalSeed = {
  tops: [
    {
      slug: "motorcycles", name: "Motorcycles", icon: "motorbike", sequence: 1, priceMode: "negotiable", conditions: ["used", "new"],
      brands: {
        Honda: ["CD 70", "CD 70 Dream", "Pridor", "CG 125", "CG 125 Special Edition", "CB 125F", "CB 150F", "CB 250F"],
        Yamaha: ["YB 125Z", "YB 125Z-DX", "YBR 125", "YBR 125G"],
        Suzuki: ["GD 110S", "GS 150", "GS 150 SE", "GR 150", "GSX 125"],
        United: ["US 70", "US 100", "US 125"],
        "Road Prince": ["RP 70", "RP 110", "Robinson 150", "Wego 150"],
        Unique: ["UD 70", "UD 100", "UD 125"],
        "Super Power": ["SP 70", "SP 100", "SP 125"],
        "Super Star": ["SS 70", "SS 125"],
        "Hi Speed": ["SR 70", "Infinity 150"],
        Crown: ["Lifan 70", "Lifan 150"],
        Ravi: ["Piaggio 70", "Storm 125"],
        Metro: ["MR 70", "MR 125"],
        Kawasaki: ["Ninja 400", "Z900"],
        Benelli: ["TNT 150i", "302S", "Leoncino 500"],
        Other: [],
      },
    },
    {
      slug: "scooters", name: "Scooters", icon: "scooter", sequence: 2, priceMode: "negotiable", conditions: ["used", "new"],
      brands: {
        Honda: ["Dio", "Activa"],
        Yamaha: ["Ray ZR"],
        Suzuki: ["Address"],
        United: ["Scooty 100"],
        Other: [],
      },
    },
    {
      slug: "electric-bikes", name: "Electric Bikes", icon: "electric", sequence: 3, priceMode: "negotiable", conditions: ["used", "new"],
      brands: {
        Yadea: ["T5", "Ruby", "G5"],
        Vlektra: ["Retro", "Bolt"],
        Jolta: ["JE-70D", "JE-Scooter"],
        Evee: ["C1", "Nisa"],
        "Metro EV": ["E8"],
        Other: [],
      },
    },
    { slug: "bike-parts", name: "Spare Parts", icon: "parts", sequence: 4, priceMode: "negotiable", conditions: ["used", "new"], types: ["Engine Parts", "Body & Tanki", "Lights & Indicators", "Brakes & Clutch", "Tyres & Rims", "Chain & Sprocket", "Batteries & Electrical", "Silencers"] },
    { slug: "bike-accessories", name: "Accessories & Gear", icon: "helmet", sequence: 5, priceMode: "fixed", conditions: ["new", "used"], types: ["Helmets", "Riding Gear", "Covers & Locks", "Seat Covers", "Mobile Holders", "Trackers"] },
  ],
  fields: [
    { name: "Model year", slug: "model_year", type: "number", tops: ALL_BIKES, sequence: 1, required: true, filterable: true, min: 1970, max: YEAR_MAX, placeholder: "e.g. 2022", group: "Details" },
    { name: "Mileage", slug: "mileage", type: "number", tops: ALL_BIKES, sequence: 2, required: true, filterable: true, unit: "km", min: 0, max: 500_000, placeholder: "e.g. 12000", helpText: "Kilometres on the meter.", group: "Details" },
    { name: "Engine", slug: "engine_capacity", type: "dropdown", tops: PETROL_TOPS, sequence: 3, required: true, filterable: true, values: ["70cc", "100cc", "110cc", "125cc", "150cc", "200cc", "250cc", "300cc+"], group: "Details", allowCustom: true },
    { name: "Registered in", slug: "registered_in", type: "dropdown", tops: ALL_BIKES, sequence: 4, filterable: true, values: REG, group: "Details", allowCustom: true },
    { name: "Starter", slug: "starter", type: "dropdown", tops: PETROL_TOPS, sequence: 5, filterable: true, values: ["Kick Start", "Self Start", "Kick & Self Start"], group: "Details" },
    { name: "Colour", slug: "color", type: "dropdown", tops: ALL_BIKES, sequence: 6, filterable: true, values: ["Red", "Black", "Blue", "White", "Silver", "Grey", "Green", "Other"], group: "Details" },
    { name: "Range", slug: "battery_range", type: "number", tops: ["electric-bikes"], sequence: 3, filterable: true, unit: "km", min: 10, max: 500, placeholder: "e.g. 80", helpText: "Kilometres on one full charge.", group: "Battery" },
    { name: "Battery", slug: "battery_type", type: "dropdown", tops: ["electric-bikes"], sequence: 4, filterable: true, values: ["Lithium-ion", "Graphene", "Lead Acid"], group: "Battery" },
    { name: "Motor power", slug: "motor_power", type: "number", tops: ["electric-bikes"], sequence: 5, unit: "W", min: 100, max: 20_000, placeholder: "e.g. 1200", group: "Battery" },
    { name: "Documents", slug: "documents", type: "multiselect", tops: ALL_BIKES, sequence: 7, values: ["Original Book", "Smart Card", "Original File", "Token Tax Paid", "Transfer Letter"], group: "Details" },
    { name: "Features", slug: "features", type: "multiselect", tops: ALL_BIKES, sequence: 8, group: "Features", values: ["Self Start", "Disc Brake", "Alloy Rims", "Tubeless Tyres", "Digital Meter", "Tracker Installed", "New Tyres", "New Battery", "Fuel Injection", "USB Charger"] },
    { name: "Fits make", slug: "fits_make", type: "dropdown", tops: ["bike-parts", "bike-accessories"], sequence: 1, filterable: true, values: ["Universal", "Honda", "Yamaha", "Suzuki", "United", "Road Prince", "Unique", "Super Power", "Other"], allowCustom: true },
  ],
  faqs: [
    { question: "Is posting an ad free?", answer: "Yes — your first ad is free. Plans with more ads and featured placement are available for dealers and regular sellers.", category: "Selling" },
    { question: "What should I check before buying a used bike?", answer: "Match the chassis and engine numbers with the registration book or smart card, check the token tax, start it cold, test brakes and gears, and look for a bent frame or fresh welding. Never pay before you've seen the bike and its papers.", category: "Buying" },
    { question: "How does bike transfer work?", answer: "Transfer is done at the Excise & Taxation office of the registration city (most provinces also offer biometric transfer). The seller's CNIC copy, the original book/smart card and a sale letter are needed.", category: "Buying" },
    { question: "How do I become a verified seller?", answer: "Add your mobile number and upload your CNIC (front and back) from My account → Seller verification. Once approved, the verified badge shows on all your ads.", category: "Account" },
    { question: "How do I deal safely?", answer: "Never send an advance or 'token' payment. Meet in a public place in daylight, test ride, check the papers, then pay.", category: "Safety" },
  ],
  blog: [
    { title: "Buying a used motorcycle in Pakistan: the checklist", slug: "used-bike-buying-checklist", category: "Guides", excerpt: "Papers, engine, frame and a fair price — step by step.", content: "<h2>1. Papers first</h2><p>Original book or smart card, token tax, and matching chassis/engine numbers.</p><h2>2. Engine & frame</h2><p>Cold start, smoke, noises — and look for fresh welding.</p><h2>3. Test ride</h2><p>Brakes, clutch, gears and steering.</p><h2>4. Pay safely</h2><p>Only after the papers are with you. Never send advance.</p>" },
    { title: "Electric bikes in Pakistan: are they worth it?", slug: "electric-bikes-worth-it", category: "Buying", excerpt: "Range, battery life, charging cost and resale explained.", content: "<h2>Range</h2><p>Real-world range is usually 70–80% of the claimed figure.</p><h2>Battery</h2><p>Lithium-ion lasts longer than lead acid — ask about battery age and warranty.</p><h2>Running cost</h2><p>A full charge costs a fraction of a litre of petrol.</p>" },
    { title: "How to sell your bike faster", slug: "sell-your-bike-faster", category: "Selling", excerpt: "Clean photos, honest details and the right price.", content: "<h2>Photos</h2><p>Wash it, shoot in daylight from both sides, plus the meter and engine.</p><h2>Details</h2><p>Model year, mileage, registration city and any work done.</p><h2>Price</h2><p>Compare similar ads by year and city.</p>" },
  ],
  reportReasons: ["Spam or misleading ad", "Bike already sold", "Fraud / asks for advance payment", "Stolen bike or fake documents", "Offensive or inappropriate content", "Wrong category / make / model", "Duplicate ad"],
  rails: [
    { title: "Featured bikes", filter: "featured" },
    { title: "Honda", filter: "category", value: "motorcycles/honda" },
    { title: "Electric bikes", filter: "category", value: "electric-bikes" },
  ],
  demo: [
    { title: "Honda CD 70 2023 Karachi number", top: "motorcycles", brand: "Honda", model: "CD 70", price: 148_000, condition: "used", city: "Karachi", area: "Gulshan-e-Iqbal", featured: true, tint: "#b91c1c", specs: { model_year: 2023, mileage: 9500, engine_capacity: "70cc", registered_in: "Karachi", starter: "Kick Start", color: "Red", documents: ["Original Book", "Smart Card", "Token Tax Paid"], features: ["New Tyres"] }, description: "First owner, genuine condition, never opened engine. Complete documents, token paid." },
    { title: "Honda CG 125 2022 Lahore number", top: "motorcycles", brand: "Honda", model: "CG 125", price: 238_000, condition: "used", city: "Lahore", area: "Johar Town", featured: true, tint: "#111827", specs: { model_year: 2022, mileage: 21000, engine_capacity: "125cc", registered_in: "Lahore", starter: "Kick Start", color: "Black", documents: ["Original Book", "Smart Card"], features: ["New Battery"] }, description: "Excellent condition, engine sealed, fuel average 40+. Genuine buyers only." },
    { title: "Yamaha YBR 125G 2021", top: "motorcycles", brand: "Yamaha", model: "YBR 125G", price: 345_000, condition: "used", city: "Islamabad", area: "G-11", tint: "#1e3a8a", specs: { model_year: 2021, mileage: 18000, engine_capacity: "125cc", registered_in: "Islamabad", starter: "Self Start", color: "Blue", documents: ["Original Book", "Smart Card", "Token Tax Paid"], features: ["Self Start", "Disc Brake", "Alloy Rims"] }, description: "Well maintained, company services, alloy rims and disc brake. Islamabad number." },
    { title: "Suzuki GS 150 SE 2022", top: "motorcycles", brand: "Suzuki", model: "GS 150 SE", price: 390_000, condition: "used", city: "Rawalpindi", area: "Satellite Town", tint: "#374151", specs: { model_year: 2022, mileage: 14000, engine_capacity: "150cc", registered_in: "Punjab", starter: "Kick & Self Start", color: "Black", documents: ["Original Book", "Smart Card"], features: ["Self Start", "Alloy Rims", "Digital Meter"] }, description: "Special edition, total genuine, first owner. Documents complete." },
    { title: "Honda CB 150F 2023 — like new", top: "motorcycles", brand: "Honda", model: "CB 150F", price: 510_000, condition: "used", city: "Faisalabad", tint: "#991b1b", specs: { model_year: 2023, mileage: 6000, engine_capacity: "150cc", registered_in: "Punjab", starter: "Self Start", color: "Red", documents: ["Original Book", "Smart Card", "Token Tax Paid"], features: ["Self Start", "Disc Brake", "Alloy Rims", "Tubeless Tyres", "Digital Meter"] }, description: "Almost new, 6000 km driven, all services from dealer." },
    { title: "Yamaha YB 125Z-DX 2024 brand new", top: "motorcycles", brand: "Yamaha", model: "YB 125Z-DX", price: 405_000, condition: "new", city: "Multan", area: "Cantt", tint: "#0f172a", specs: { model_year: 2024, mileage: 0, engine_capacity: "125cc", registered_in: "Un-Registered", starter: "Self Start", color: "Black", documents: ["Original File"], features: ["Self Start", "Alloy Rims"] }, description: "Zero meter, dealer invoice, open registration." },
    { title: "United US 70 2022", top: "motorcycles", brand: "United", model: "US 70", price: 108_000, condition: "used", city: "Gujranwala", tint: "#dc2626", specs: { model_year: 2022, mileage: 16000, engine_capacity: "70cc", registered_in: "Punjab", starter: "Kick Start", color: "Red", documents: ["Original Book"], features: [] }, description: "Good fuel average, genuine condition, ready to ride." },
    { title: "Suzuki GD 110S 2021", top: "motorcycles", brand: "Suzuki", model: "GD 110S", price: 238_000, condition: "used", city: "Peshawar", tint: "#1f2937", specs: { model_year: 2021, mileage: 24000, engine_capacity: "110cc", registered_in: "Khyber Pakhtunkhwa", starter: "Kick & Self Start", color: "Black", documents: ["Original Book", "Smart Card"], features: ["Self Start"] }, description: "Smooth engine, self start working, family used." },
    { title: "Yadea T5 electric scooter 2024", top: "electric-bikes", brand: "Yadea", model: "T5", price: 345_000, condition: "used", city: "Lahore", area: "DHA Phase 5", featured: true, tint: "#0f766e", specs: { model_year: 2024, mileage: 3500, registered_in: "Lahore", color: "White", battery_range: 90, battery_type: "Graphene", motor_power: 1200, documents: ["Original Book", "Smart Card"], features: ["Disc Brake", "Digital Meter", "Tubeless Tyres"] }, description: "Under battery warranty, charger included, very low running cost." },
    { title: "Vlektra Retro electric 2023", top: "electric-bikes", brand: "Vlektra", model: "Retro", price: 290_000, condition: "used", city: "Islamabad", area: "F-10", tint: "#4b5563", specs: { model_year: 2023, mileage: 7000, registered_in: "Islamabad", color: "Grey", battery_range: 70, battery_type: "Lithium-ion", motor_power: 2000, documents: ["Original Book"], features: ["Disc Brake", "Digital Meter"] }, description: "Classic look, lithium battery healthy, home charging." },
    { title: "Honda Dio scooter 2020", top: "scooters", brand: "Honda", model: "Dio", price: 265_000, condition: "used", city: "Karachi", area: "Clifton", tint: "#e5e7eb", specs: { model_year: 2020, mileage: 11000, engine_capacity: "110cc", registered_in: "Karachi", starter: "Self Start", color: "White", documents: ["Original Book"], features: ["Self Start"] }, description: "Imported scooty, self start, perfect for city use." },
    { title: "Full-face helmet (DOT) — size L", top: "bike-accessories", type: "Helmets", price: 6_500, condition: "new", city: "Lahore", area: "Gulberg", tint: "#1f2937", specs: { fits_make: "Universal" }, description: "Brand new, DOT certified, clear visor plus tinted spare." },
  ],
};
