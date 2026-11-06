import type { SpecIconKey } from "../icons";

/** Seed data for a vertical (used once, by the first-run setup — lib/setup.ts). */
export type SeedTop = {
  slug: string;
  name: string;
  icon: SpecIconKey;
  sequence: number;
  priceMode: "negotiable" | "fixed";
  conditions: string[];
  /** Make → models: a two-level tree (/cars/toyota/toyota-corolla). */
  brands?: Record<string, string[]>;
  /** Plain sub-types instead (/car-parts/brakes). */
  types?: string[];
};

export type SeedField = {
  name: string;
  slug: string;
  type: "dropdown" | "multiselect" | "number" | "text";
  tops: string[];
  sequence: number;
  required?: boolean;
  filterable?: boolean;
  values?: string[];
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  helpText?: string;
  group?: string;
  allowCustom?: boolean;
};

export type SeedDemoAd = {
  title: string;
  top: string;
  brand?: string;
  model?: string;
  type?: string;
  price: number;
  condition: "new" | "used";
  city: string;
  area?: string;
  featured?: boolean;
  specs: Record<string, string | number | string[]>;
  description: string;
  /** Colour of the generated demo picture. */
  tint: string;
};

export type SeedPlace = { name: string; slug: string; lat: number; lng: number };

export type VerticalSeed = {
  /** Places this vertical needs beyond the shared city list (seed/pk-locations.json). */
  places?: {
    states?: { name: string; slug: string; order: number }[];
    cities?: (SeedPlace & { state: string; order: number })[];
    /** Extra areas by city name — e.g. the big cattle mandis. */
    areas?: Record<string, SeedPlace[]>;
  };
  /** The starter About / How it works / Safety pages, when the generic wording doesn't fit. */
  pages?: { about?: string; howItWorks?: string; safety?: string };
  /** The starter plans, when the generic Starter / Business / Dealer don't fit. */
  plans?: { name: string; price: number; finalPrice: number; listingLimit: number; featuredLimit: number; description: string; features: string[]; isPopular?: boolean }[];
  tops: SeedTop[];
  fields: SeedField[];
  faqs: { question: string; answer: string; category: string }[];
  blog: { title: string; slug: string; category: string; excerpt: string; content: string }[];
  reportReasons: string[];
  /** Home rails: [title, filter, value]. */
  rails: { title: string; filter: "featured" | "category" | "city"; value?: string }[];
  demo: SeedDemoAd[];
};
