/**
 * Search keywords — what makes search scale.
 *
 * Every listing stores `kw`: its normalised title words + the names of its
 * category chain (section, brand, model) + key specs. `kw` has a multikey
 * index, so a search is an index lookup ("samsung" → the ads tagged samsung)
 * instead of a regex over every title (1.6 s per rare word at 300k ads, and
 * growing linearly with the catalogue).
 *
 * The Listing model fills `kw` on every save; `scripts/reindex-keywords.mjs`
 * backfills existing ads. Partial words ("sams") are expanded to known
 * vocabulary ("samsung") before the lookup, so type-ahead still hits the index.
 */
export { normalizeText, listingKeywords } from "./keywords-core.mjs";
