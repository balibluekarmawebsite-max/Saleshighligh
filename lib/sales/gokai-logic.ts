/**
 * Pure normalisation for the Restaurant "Gokai CRM" upload — the Gokai guest-
 * experience report's six metrics plus the month-over-month % each card prints:
 *   Guests Added (sign-ups), Guest Journey Open Rate, Click-through Rate,
 *   Pre-arrival Survey Completion, Upsell Sales, Upsell Revenue.
 * Rates are stored as ratios (0–1) and shown ×100; the reported MoM is a signed
 * percent kept as-is (it can be large, e.g. +349,800,000). Everything feeds one
 * GokaiReport row per (period, unit).
 */

import { normalizeNumber } from "@/lib/import/number";

export const toInt = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.round(n);
};
export const toNum = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : n;
};

/**
 * US-formatted number: comma = thousands (removed), dot = decimal (kept). Gokai
 * prints its percentages and MoM this way with 3-decimal precision ("40.816",
 * "8.519", "349,800,000"), which the Indonesian-aware parser would misread as
 * thousands. Used for rates and the reported MoM; counts/money use the
 * locale-aware parser.
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
/** Money, defaulting to 0, clamped ≥ 0 (locale-aware for IDR amounts). */
const money = (o: Record<string, unknown>, ...keys: string[]): number => {
  const n = toNum(firstDefined(o, ...keys));
  return n == null ? 0 : Math.max(0, n);
};
/** A percentage stored as a ratio 0–1 ("40.816%" → 0.40816), clamped [0, 1]. */
const ratio = (o: Record<string, unknown>, ...keys: string[]): number => {
  const n = toUsNum(firstDefined(o, ...keys));
  return n == null ? 0 : Math.min(1, Math.max(0, n / 100));
};
/** A signed percent for the reported MoM ("−34.664" → -34.664), null when absent. No clamp. */
const signed = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  const n = toUsNum(firstDefined(o, ...keys));
  return n == null ? null : n;
};

export interface GokaiCore {
  signups: number;
  openRatePct: number; // ratio 0–1
  ctrPct: number; // ratio 0–1
  surveyCompletionPct: number; // ratio 0–1
  productViews: number;
  upsellSales: number;
  upsellRevenue: number;
  refunds: number;
  signupsMom: number | null;
  openRateMom: number | null;
  ctrMom: number | null;
  surveyMom: number | null;
  upsellSalesMom: number | null;
  upsellRevenueMom: number | null;
}

/** Coerce the (possibly partial, possibly AI-keyed) Gokai figures into the full
 * GokaiReport shape. Missing metrics default to 0; a missing MoM is null. */
export function coerceGokaiCore(raw: unknown): GokaiCore {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    signups: count(o, "signups", "guestsAdded", "signUps", "guests"),
    openRatePct: ratio(o, "openRatePct", "openRate", "guestJourneyOpenRate", "openRatePercent"),
    ctrPct: ratio(o, "ctrPct", "ctr", "clickThroughRate", "guestJourneyClickThroughRate"),
    surveyCompletionPct: ratio(o, "surveyCompletionPct", "surveyCompletion", "survey", "preArrivalSurveyCompletionRate"),
    productViews: count(o, "productViews"),
    upsellSales: count(o, "upsellSales", "upsellTransactions"),
    upsellRevenue: money(o, "upsellRevenue", "upsellRevenueIdr"),
    refunds: count(o, "refunds"),
    signupsMom: signed(o, "signupsMom", "guestsAddedMom"),
    openRateMom: signed(o, "openRateMom"),
    ctrMom: signed(o, "ctrMom", "clickThroughRateMom"),
    surveyMom: signed(o, "surveyMom", "surveyCompletionMom"),
    upsellSalesMom: signed(o, "upsellSalesMom"),
    upsellRevenueMom: signed(o, "upsellRevenueMom"),
  };
}

/**
 * The GokaiReport columns the uploader FORM owns: the six metrics + their six
 * reported MoM values. It deliberately omits `productViews` and `refunds`, which
 * the form has no inputs for (coerceGokaiCore defaults them to 0). Those two are
 * owned by the monthly Excel import and read by the Spa page / PPTX export, and
 * the GokaiReport row is shared per (period, unit). Using this for the UPDATE
 * path means a form save never zeroes imported productViews/refunds on an
 * existing row; they are only set on CREATE (where there is no prior value).
 */
export function gokaiFormOwnedUpdate(c: GokaiCore) {
  return {
    signups: c.signups,
    openRatePct: c.openRatePct,
    ctrPct: c.ctrPct,
    surveyCompletionPct: c.surveyCompletionPct,
    upsellSales: c.upsellSales,
    upsellRevenue: c.upsellRevenue,
    signupsMom: c.signupsMom,
    openRateMom: c.openRateMom,
    ctrMom: c.ctrMom,
    surveyMom: c.surveyMom,
    upsellSalesMom: c.upsellSalesMom,
    upsellRevenueMom: c.upsellRevenueMom,
  };
}

/** True when at least one metric carries data (guards an empty save). */
export function gokaiHasData(c: GokaiCore): boolean {
  return (
    c.signups > 0 ||
    c.openRatePct > 0 ||
    c.ctrPct > 0 ||
    c.surveyCompletionPct > 0 ||
    c.productViews > 0 ||
    c.upsellSales > 0 ||
    c.upsellRevenue > 0 ||
    c.refunds > 0
  );
}

export const GOKAI_UNITS = ["HOTEL", "RESTAURANT", "SPA"] as const;
export type GokaiUnit = (typeof GOKAI_UNITS)[number];

export function normalizeGokaiUnit(v: unknown): GokaiUnit {
  const s = String(v ?? "").trim().toUpperCase();
  return (GOKAI_UNITS as readonly string[]).includes(s) ? (s as GokaiUnit) : "RESTAURANT";
}
