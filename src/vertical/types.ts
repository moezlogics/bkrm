/**
 * A "vertical" is what the marketplace sells (cars, bikes…). Everything that
 * differs between them lives in one config object — words on the page, which
 * specs show on cards and ad pages, search synonyms, spam rules, icons, the
 * seed data — so the code itself stays identical for every site.
 * Pick one with NEXT_PUBLIC_VERTICAL (see ./index.ts).
 */
import type { SpecIconKey } from "./icons";

/** One spec shown as a chip / key fact, read from Listing.customFieldValues[field]. */
export type SpecDef = {
  field: string;
  icon: SpecIconKey;
  /** Label under the value on the ad page ("Model year"). */
  label: string;
  /** How to print the value: thousands separators + unit, etc. */
  format?: "plain" | "km" | "cc" | "year" | "watts" | "kg" | "inch";
  /** Words after the value on cards ("3" → "3 shares left"). */
  suffix?: string;
};

export type VerticalId = "cars" | "bikes" | "bakra";

export type BookingDay = {
  key: string;
  label: string;
  /** Days after the event date (0 = the event day). */
  offset?: number;
  /** The customer picks a date before the event instead. */
  pickDate?: boolean;
};

export type BookingConfig = {
  service?: {
    /** Sections whose ads can be booked. */
    tops: string[];
    cta: string;
    title: string;
    /** What a booking counts, each with the ad field holding its rate. */
    units: { key: string; label: string; rateField?: string }[];
    /** Ad field: how many units the provider takes in one day. */
    capacityField?: string;
    /** Ad field (multi-select) listing the days offered, by label. */
    daysField?: string;
    days: BookingDay[];
    slots: { key: string; label: string }[];
    note?: string;
  };
  share?: {
    tops: string[];
    cta: string;
    title: string;
    totalField: string;
    leftField: string;
    /** Ad field naming the day (by a day label). */
    dayField?: string;
    days: BookingDay[];
    maxPerBooking: number;
    namesLabel: string;
    note?: string;
  };
};

export type Vertical = {
  id: VerticalId;
  /** Words for what's sold. */
  noun: { one: string; many: string; One: string; Many: string };
  /** Top category most links point to ("Browse all"): its path. */
  primaryTop: string;
  /** Word for a manufacturer in the sell wizard / filters ("make"). */
  brandWord: { one: string; many: string };
  /** Category type stored on the seeded catalogue (default "vehicle"). */
  listingType?: "item" | "vehicle" | "property" | "job" | "service";
  /**
   * A site built around one date (Eid ul Adha for a bakra mandi): the home page
   * counts down to it. The admin changes name and date in Settings → Homepage.
   */
  event?: { name: string; date: string; note?: string };
  /**
   * Ads people can book instead of only calling (lib/bookings): a provider's
   * time (qasai, transport…) or shares of an animal (hissa). Off when absent.
   */
  bookings?: BookingConfig;
  /** What the second level is called in a section, when it isn't `brandWord` (e.g. { "qasai-services": "service" }). */
  subLabels?: Record<string, string>;
  /** Defaults until the admin changes them in Settings. */
  defaults: {
    siteName: string;
    tagline: string;
    heroTitle: string;
    heroSubtitle: string;
    searchPlaceholder: string;
    metaKeywords: string[];
    /** Starting brand colour ("#rrggbb"); the admin changes it in Branding. */
    brandColor: string;
  };
  copy: {
    sellCta: string;            // "Sell your car"
    browseAll: string;          // "Browse all cars"
    everythingLabel: string;    // "Cars, parts & accessories" (national archive title)
    inCityLabel: string;        // "Cars & parts" (city archive title prefix)
    titleHint: string;          // wizard: ad title hint
    titlePlaceholder: string;
    modelNotListed: string;     // wizard: "Model not listed? Type it (e.g. Corolla Cross)"
    videoHint: string;
    descriptionPlaceholder: string;
    inspectTip: string;         // safety line on ad pages
    /** Sell wizard: heading over a flat list of sub-categories ("Which breed?"). */
    subPicker?: string;
    /** Header search box hint (default "Search cars, makes and models"). */
    searchHint?: string;
    /** The "Safety First" note beside the contact buttons. */
    safetyNote?: string;
    /** First-run setup: what the built-in catalogue holds ("Car makes and models"). */
    catalogue?: string;
  };
  /** Home trust strip. */
  trust: { icon: SpecIconKey; title: string; sub: string }[];
  /** Default category icon + the "no photo" picture. */
  icon: SpecIconKey;
  placeholderImage: string;
  /** Specs on listing cards (first 4 that have a value). */
  cardSpecs: SpecDef[];
  /** Ad page: the big key-facts strip; `featureFields` show as a checklist. */
  keySpecs: SpecDef[];
  featureFields: string[];
  /** Sell wizard: fields appended to make + model for the suggested title. */
  titleFields: string[];
  /** Search: everyday words → category paths. */
  searchAliases: Record<string, string>;
  /** Spam: minimum believable price per top category (below = flagged). */
  priceFloor: Record<string, number>;
  /** AI moderator: what the site sells + scams typical for it. */
  moderation: { sells: string; scamHints: string[] };
  /** Prices: "lakh" prints 45,50,000 as "45.5 lacs" (how Pakistan quotes vehicles). */
  priceStyle: "lakh" | "plain";
  /** Home: price bands for "Browse by budget" (PKR, upper bounds). */
  budgets: number[];
};
