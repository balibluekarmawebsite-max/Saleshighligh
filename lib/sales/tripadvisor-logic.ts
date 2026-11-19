/**
 * Pure normalisation for the Restaurant "Tripadvisor" listing report. Captures
 * the three report tabs the sample shows:
 *   Performance      — rating, ranking (#N of M), listing impressions, page visitors
 *   Reviews          — new reviews, QR-code reviews
 *   Listing engagement — photo/video views, special-offer & update clicks, menu
 *                        views, phone calls, website clicks, map views
 * Each traffic/engagement metric carries the report's own "vs previous period" %
 * (signed; kept as reported). Everything feeds one TripadvisorMetrics row per
 * (period, unit).
 */

import { normalizeNumber } from "@/lib/import/number";

/** A whole number (locale-aware: "7,090" → 7090), rounded. Null when unreadable. */
export const toInt = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.round(n);
};

/**
 * A small signed decimal — a rating ("5.0") or a Tripadvisor MoM % ("-9", "+25").
 * Tolerates EITHER decimal separator: the AI emits a dot ("4.5"), a manual typist
 * may use a comma ("4,5"); both parse to 4.5. Safe because a rating (0–5) and a
 * Tripadvisor MoM never carry a thousands separator, so a comma is always the
 * decimal point. A stray "%" or spaces are ignored.
 */
export const toDecimal = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[%\s]/g, "");
  if (s === "") return null;
  s = s.replace(/,/g, "."); // comma → decimal point
  // If several dots slipped in, keep the last as the decimal point.
  const parts = s.split(".");
  if (parts.length > 2) s = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
  if (s === "" || s === "-" || s === ".") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const firstDefined = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) {
    const x = o[k];
    if (x !== undefined && x !== null && String(x).trim() !== "") return x;
  }
  return undefined;
};

/** A whole count, defaulting to 0, clamped ≥ 0. */
const count = (o: Record<string, unknown>, ...keys: string[]): number => {
  const n = toInt(firstDefined(o, ...keys));
  return n == null ? 0 : Math.max(0, n);
};
/** A nullable whole number ≥ 0 (for ranking, where "absent" is meaningful). */
const intOrNull = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  const n = toInt(firstDefined(o, ...keys));
  return n == null ? null : Math.max(0, n);
};
/** A review rating, defaulting to 0, clamped [0, 5]. */
const rating = (o: Record<string, unknown>, ...keys: string[]): number => {
  const n = toDecimal(firstDefined(o, ...keys));
  return n == null ? 0 : Math.min(5, Math.max(0, n));
};
/** A signed reported MoM percent ("-9" → -9), null when absent. No clamp. */
const signed = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  const n = toDecimal(firstDefined(o, ...keys));
  return n == null ? null : n;
};

export interface TripadvisorCore {
  // Hero
  rank: number | null;
  totalInMarket: number | null;
  avgRating: number; // 0–5
  // Counts
  impressions: number;
  pageVisitors: number;
  newReviews: number;
  qrReviews: number;
  photoViews: number;
  videoViews: number;
  specialOfferClicks: number;
  updateViews: number;
  menuViews: number;
  phoneCalls: number;
  websiteClicks: number;
  mapViews: number;
  // Reported MoM (signed %, null when not entered)
  impressionsMom: number | null;
  pageVisitorsMom: number | null;
  photoViewsMom: number | null;
  videoViewsMom: number | null;
  specialOfferClicksMom: number | null;
  updateViewsMom: number | null;
  menuViewsMom: number | null;
  phoneCallsMom: number | null;
  websiteClicksMom: number | null;
  mapViewsMom: number | null;
}

/** Coerce the (possibly partial, possibly AI-keyed) Tripadvisor figures into the
 * full TripadvisorMetrics shape. Missing counts default to 0; rank/total stay
 * null; a missing MoM is null. */
export function coerceTripadvisorCore(raw: unknown): TripadvisorCore {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    rank: intOrNull(o, "rank", "ranking", "position"),
    totalInMarket: intOrNull(o, "totalInMarket", "total", "outOf", "ofTotal"),
    avgRating: rating(o, "avgRating", "rating", "averageRating"),
    impressions: count(o, "impressions", "listingImpressions"),
    pageVisitors: count(o, "pageVisitors", "uniquePageVisitors", "visitors", "uniqueVisitors"),
    newReviews: count(o, "newReviews", "reviews"),
    qrReviews: count(o, "qrReviews", "qrCodeReviews", "qr"),
    photoViews: count(o, "photoViews", "photos"),
    videoViews: count(o, "videoViews", "videos"),
    specialOfferClicks: count(o, "specialOfferClicks", "offerClicks", "specialOffers"),
    updateViews: count(o, "updateViews", "updates"),
    menuViews: count(o, "menuViews", "menu"),
    phoneCalls: count(o, "phoneCalls", "calls"),
    websiteClicks: count(o, "websiteClicks", "clicks"),
    mapViews: count(o, "mapViews", "directions"),
    impressionsMom: signed(o, "impressionsMom"),
    pageVisitorsMom: signed(o, "pageVisitorsMom"),
    photoViewsMom: signed(o, "photoViewsMom"),
    videoViewsMom: signed(o, "videoViewsMom"),
    specialOfferClicksMom: signed(o, "specialOfferClicksMom"),
    updateViewsMom: signed(o, "updateViewsMom"),
    menuViewsMom: signed(o, "menuViewsMom"),
    phoneCallsMom: signed(o, "phoneCallsMom"),
    websiteClicksMom: signed(o, "websiteClicksMom"),
    mapViewsMom: signed(o, "mapViewsMom"),
  };
}

/** True when at least one metric carries data (guards an empty save). */
export function tripadvisorHasData(c: TripadvisorCore): boolean {
  return (
    c.avgRating > 0 ||
    c.rank != null ||
    c.impressions > 0 ||
    c.pageVisitors > 0 ||
    c.newReviews > 0 ||
    c.qrReviews > 0 ||
    c.photoViews > 0 ||
    c.videoViews > 0 ||
    c.specialOfferClicks > 0 ||
    c.updateViews > 0 ||
    c.menuViews > 0 ||
    c.phoneCalls > 0 ||
    c.websiteClicks > 0 ||
    c.mapViews > 0
  );
}

/** The engagement/traffic metrics shown in the grid (order follows the report).
 * `momField` is null for metrics the report shows without a MoM arrow. Shared by
 * the uploader form and (for labels) the read path. */
export const TRIPADVISOR_METRICS = [
  { key: "impressions", label: "Listing Impressions", valueField: "impressions", momField: "impressionsMom" },
  { key: "pageVisitors", label: "Unique Page Visitors", valueField: "pageVisitors", momField: "pageVisitorsMom" },
  { key: "newReviews", label: "New Reviews", valueField: "newReviews", momField: null },
  { key: "qrReviews", label: "QR Code Reviews", valueField: "qrReviews", momField: null },
  { key: "photoViews", label: "Photo Views", valueField: "photoViews", momField: "photoViewsMom" },
  { key: "videoViews", label: "Video Views", valueField: "videoViews", momField: "videoViewsMom" },
  { key: "specialOfferClicks", label: "Special Offer Clicks", valueField: "specialOfferClicks", momField: "specialOfferClicksMom" },
  { key: "updateViews", label: "Update Views", valueField: "updateViews", momField: "updateViewsMom" },
  { key: "menuViews", label: "Menu Views", valueField: "menuViews", momField: "menuViewsMom" },
  { key: "phoneCalls", label: "Phone Calls", valueField: "phoneCalls", momField: "phoneCallsMom" },
  { key: "websiteClicks", label: "Website Clicks", valueField: "websiteClicks", momField: "websiteClicksMom" },
  { key: "mapViews", label: "Map Views", valueField: "mapViews", momField: "mapViewsMom" },
] as const;

/** Alias keys the AI might use per count field (conservative — no "photos"/"videos"
 * which collide with asset-inventory counts). */
const COUNT_ALIASES: Record<string, string[]> = {
  impressions: ["impressions", "listingImpressions"],
  pageVisitors: ["pageVisitors", "uniquePageVisitors", "visitors", "uniqueVisitors"],
  newReviews: ["newReviews", "reviews"],
  qrReviews: ["qrReviews", "qrCodeReviews", "qr"],
  photoViews: ["photoViews"],
  videoViews: ["videoViews"],
  specialOfferClicks: ["specialOfferClicks", "offerClicks", "specialOffers"],
  updateViews: ["updateViews", "updates"],
  menuViews: ["menuViews", "menu"],
  phoneCalls: ["phoneCalls", "calls"],
  websiteClicks: ["websiteClicks", "clicks"],
  mapViews: ["mapViews", "directions"],
};

/**
 * Read ONLY the uploader form fields the input actually provides — NO
 * 0-defaulting. Used for the AI-compile PREVIEW so a partial paste (e.g. just the
 * Performance tab) seeds only what it mentions and never overwrites fields from
 * another tab. Keys are the uploader's form field names; a value the report shows
 * explicitly as 0 IS read (0), but a field the AI couldn't read is omitted.
 */
export function readTripadvisorForm(raw: unknown): Record<string, number> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  const rt = toDecimal(firstDefined(o, "rating", "averageRating", "avgRating"));
  if (rt != null) out.rating = Math.min(5, Math.max(0, rt));
  const rk = toInt(firstDefined(o, "rank", "ranking", "position"));
  if (rk != null) out.rank = Math.max(0, rk);
  const tot = toInt(firstDefined(o, "totalInMarket", "total", "outOf", "ofTotal"));
  if (tot != null) out.totalInMarket = Math.max(0, tot);
  for (const m of TRIPADVISOR_METRICS) {
    const v = toInt(firstDefined(o, ...(COUNT_ALIASES[m.valueField] ?? [m.valueField])));
    if (v != null) out[m.valueField] = Math.max(0, v);
    if (m.momField) {
      const mom = toDecimal(firstDefined(o, m.momField));
      if (mom != null) out[m.momField] = mom;
    }
  }
  return out;
}
