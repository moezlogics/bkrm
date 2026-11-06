/**
 * SEO helpers — absolute URL building + schema.org JSON-LD builders.
 */
import { getSettings } from "@/lib/settings";
import { VERTICAL } from "@/vertical";

export function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

const CONDITION_SCHEMA: Record<string, string> = {
  new: "https://schema.org/NewCondition",
  used: "https://schema.org/UsedCondition",
  refurbished: "https://schema.org/RefurbishedCondition",
  "for-parts": "https://schema.org/DamagedCondition",
};

/** Product + Offer JSON-LD for a listing detail page. */
export function listingJsonLd(ad: any, url: string, vehicle?: { make?: string; model?: string }) {
  const seller = ad.userId || ad.seller || {};
  const images = ad.galleryImages?.length ? ad.galleryImages : ad.mainImage ? [ad.mainImage] : [];
  const node: any = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: ad.name || ad.title,
    description: (ad.description || "").slice(0, 500),
    image: images,
    sku: ad._id?.toString?.() || String(ad._id || ""),
    category: ad.categoryId?.name || undefined,
    itemCondition: CONDITION_SCHEMA[ad.condition] || undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: ad.currency || "PKR",
      price: ad.price != null ? String(ad.price) : "0",
      availability:
        ad.status === "sold out"
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock",
      url,
      itemCondition: CONDITION_SCHEMA[ad.condition] || undefined,
    },
  };
  // Vehicles also describe themselves as schema.org Car / Motorcycle: year,
  // mileage, fuel, transmission, engine — what vehicle search results show.
  const cf = ad.customFieldValues || {};
  const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(String(v).replace(/[^\d.]/g, ""))) ? Number(String(v).replace(/[^\d.]/g, "")) : undefined);
  const year = num(cf.model_year);
  if (year) {
    node["@type"] = ["Product", VERTICAL.id === "bikes" ? "Motorcycle" : "Car"];
    if (vehicle?.make) node.brand = { "@type": "Brand", name: vehicle.make };
    if (vehicle?.model) node.model = vehicle.model;
    node.vehicleModelDate = String(year);
    const km = num(cf.mileage);
    if (km != null) node.mileageFromOdometer = { "@type": "QuantitativeValue", value: km, unitCode: "KMT" };
    if (cf.fuel_type) node.fuelType = String(cf.fuel_type);
    if (cf.transmission) node.vehicleTransmission = String(cf.transmission);
    const cc = num(cf.engine_capacity);
    if (cc) node.vehicleEngine = { "@type": "EngineSpecification", engineDisplacement: { "@type": "QuantitativeValue", value: cc, unitCode: "CMQ" } };
    if (cf.body_type) node.bodyType = String(cf.body_type);
    const colour = cf.exterior_color || cf.color;
    if (colour) node.color = String(colour);
  }
  if (seller?.name) {
    node.offers.seller = {
      "@type": "Person",
      name: seller.name,
      ...(seller.rating && seller.ratingCount
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: String(seller.rating),
              reviewCount: String(seller.ratingCount),
              bestRating: "5",
            },
          }
        : {}),
    };
  }
  return node;
}

/** BreadcrumbList JSON-LD. items: [{name, url}] */
export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** ItemList JSON-LD of listing URLs (category/location pages). */
export function itemListJsonLd(urls: string[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: urls.map((u, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: u,
    })),
  };
}

/** WebSite + Organization JSON-LD for the homepage. */
export async function siteJsonLd() {
  const s = await getSettings();
  const base = getBaseUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: s.site_name,
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: `${base}/ads?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
