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
 * US-formatted number: comma = thousands (removed), dot = decimal (kept), signed.
 * Tripadvisor prints its rating ("5.0") and MoM ("-9", "+25") this way; the
 * Indonesian-aware parser would misread a lone dot as thousands.
 */
export const toUsNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (s === "") return null;
  s = s.replace(/[^0-9.,\-]/g, "").replace(/,/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
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
  const n = toUsNum(firstDefined(o, ...keys));
  return n == null ? 0 : Math.min(5, Math.max(0, n));
};
/** A signed reported MoM percent ("-9" → -9), null when absent. No clamp. */
const signed = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  const n = toUsNum(firstDefined(o, ...keys));
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
