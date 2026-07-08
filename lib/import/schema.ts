/**
 * Shared ingestion schema — the single source of truth for the monthly upload
 * workbook. Both the template generator (lib/import/template.ts) and the parser
 * (lib/import/parse.ts) consume this, so the columns can never drift apart.
 *
 * Each domain maps to a Phase 1 Prisma model; column keys match the model's
 * field names (minus id/periodId, which the importer injects). `scope` is fixed
 * per tab where a model is split into MTD/YTD sheets.
 */

export type ColumnType =
  | "string"
  | "int"
  | "decimal"
  | "percent" // stored as a 0–1 ratio
  | "enum"
  | "date"
  | "boolean";

export interface ColumnSpec {
  key: string;
  header: string;
  type: ColumnType;
  required?: boolean;
  enumValues?: readonly string[];
  /** Numeric columns are non-negative unless this is true. */
  allowNegative?: boolean;
  example: string | number | boolean;
}

export interface DomainSpec {
  tab: string;
  /** Prisma model delegate name (camelCase) used by the DB writer. */
  model: string;
  /** Fixed values injected into every row (e.g. scope for MTD/YTD sheets). */
  fixed?: Record<string, string>;
  /** A one-per-period model (max one data row). */
  singleton?: boolean;
  columns: ColumnSpec[];
}

// Enum value sets (mirror prisma/schema.prisma).
const DEPARTMENT = ["OCCUPANCY", "ADR", "REVPAR", "ROOM_REVENUE", "FNB", "SPA_WELLNESS", "GALLERY", "OOD", "TOTAL_REVENUE"] as const;
const SERIES = ["ACTUAL", "BUDGET", "LAST_YEAR"] as const;
const ACCOUNT_TYPE = ["OTA", "TA", "CORPORATE", "WHOLESALER"] as const;
const BUSINESS_UNIT = ["HOTEL", "RESTAURANT", "SPA"] as const;
const ADS_PLATFORM = ["GOOGLE", "META", "CORPORATE"] as const;
const MEAL_PERIOD = ["BREAKFAST", "LUNCH", "DINNER"] as const;
const FNB_CHANNEL = ["WALK_IN", "REPEATER", "CHOPE", "CATERING"] as const;
const SPA_SEGMENT = ["IN_HOUSE", "OUTSIDE", "INCLUSION"] as const;
const RANKING_PLATFORM = ["BOOKING", "EXPEDIA", "TRIPADVISOR"] as const;
const SOCIAL_PLATFORM = ["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE"] as const;

export const TEMPLATE_VERSION = "1";

export const DOMAINS: DomainSpec[] = [
  {
    tab: "SUMMARY",
    model: "revenueSummary",
    columns: [
      { key: "department", header: "Department", type: "enum", required: true, enumValues: DEPARTMENT, example: "ROOM_REVENUE" },
      { key: "actual", header: "Actual", type: "decimal", required: true, example: 847295151 },
      { key: "budget", header: "Budget", type: "decimal", required: true, example: 1089643475 },
      { key: "lastYear", header: "Last Year", type: "decimal", example: "" },
    ],
  },
  {
    tab: "SEGMENT_MTD",
    model: "segmentProduction",
    fixed: { scope: "MTD" },
    columns: [
      { key: "segmentName", header: "Segment", type: "string", required: true, example: "OTA (Online Travel Agent)" },
      { key: "series", header: "Series", type: "enum", required: true, enumValues: SERIES, example: "ACTUAL" },
      { key: "roomNights", header: "Room Nights", type: "int", required: true, example: 289 },
      { key: "arr", header: "ARR", type: "decimal", required: true, example: 1912489.08 },
      { key: "roomRevenue", header: "Room Revenue", type: "decimal", required: true, example: 552709343 },
    ],
  },
  {
    tab: "SEGMENT_YTD",
    model: "segmentProduction",
    fixed: { scope: "YTD" },
    columns: [
      { key: "segmentName", header: "Segment", type: "string", required: true, example: "OTA (Online Travel Agent)" },
      { key: "series", header: "Series", type: "enum", required: true, enumValues: SERIES, example: "ACTUAL" },
      { key: "roomNights", header: "Room Nights", type: "int", required: true, example: 1757 },
      { key: "arr", header: "ARR", type: "decimal", required: true, example: 1766589 },
      { key: "roomRevenue", header: "Room Revenue", type: "decimal", required: true, example: 3103896879 },
    ],
  },
  {
    tab: "ROOMTYPE",
    model: "roomTypeProduction",
    columns: [
      { key: "roomTypeName", header: "Room Type", type: "string", required: true, example: "Deluxe Room" },
      { key: "roomNightsActual", header: "Room Nights Actual", type: "int", required: true, example: 210 },
      { key: "roomNightsBudget", header: "Room Nights Budget", type: "int", required: true, example: 230 },
      { key: "adrActual", header: "ADR Actual", type: "decimal", required: true, example: 1650000 },
      { key: "adrBudget", header: "ADR Budget", type: "decimal", required: true, example: 1900000 },
      { key: "revenueActual", header: "Revenue Actual", type: "decimal", required: true, example: 346500000 },
      { key: "revenueBudget", header: "Revenue Budget", type: "decimal", required: true, example: 437000000 },
    ],
  },
  {
    tab: "NATIONALITY_MTD",
    model: "nationalityProduction",
    fixed: { scope: "MTD" },
    columns: [
      { key: "countryCode", header: "Country Code", type: "string", example: "AU" },
      { key: "countryName", header: "Nationality", type: "string", required: true, example: "AUSTRALIA" },
      { key: "roomNights", header: "Room Nights", type: "int", required: true, example: 184 },
      { key: "guests", header: "Guests", type: "int", example: "" },
      { key: "roomNightsLastYear", header: "Room Nights Last Year", type: "int", example: "" },
    ],
  },
  {
    tab: "NATIONALITY_YTD",
    model: "nationalityProduction",
    fixed: { scope: "YTD" },
    columns: [
      { key: "countryCode", header: "Country Code", type: "string", example: "AU" },
      { key: "countryName", header: "Nationality", type: "string", required: true, example: "AUSTRALIA" },
      { key: "roomNights", header: "Room Nights", type: "int", required: true, example: 640 },
      { key: "guests", header: "Guests", type: "int", example: "" },
      { key: "roomNightsLastYear", header: "Room Nights Last Year", type: "int", example: "" },
    ],
  },
  {
    tab: "LOS",
    model: "lengthOfStay",
    columns: [
      { key: "losBucket", header: "Nights", type: "string", required: true, example: "3" },
      { key: "bookings", header: "Bookings", type: "int", required: true, example: 38 },
      { key: "roomNights", header: "Room Nights", type: "int", required: true, example: 114 },
      { key: "lastYearRoomNights", header: "Room Nights Last Year", type: "int", example: "" },
    ],
  },
  {
    tab: "ACCOUNTS",
    model: "accountProduction",
    columns: [
      { key: "accountName", header: "Account", type: "string", required: true, example: "Booking.com" },
      { key: "accountType", header: "Type", type: "enum", required: true, enumValues: ACCOUNT_TYPE, example: "OTA" },
      { key: "roomNights", header: "Room Nights", type: "int", required: true, example: 1480 },
      { key: "revenue", header: "Revenue", type: "decimal", required: true, example: 2701269602 },
    ],
  },
  {
    tab: "ADS",
    model: "adsPerformance",
    columns: [
      { key: "unit", header: "Unit", type: "enum", required: true, enumValues: BUSINESS_UNIT, example: "HOTEL" },
      { key: "platform", header: "Platform", type: "enum", required: true, enumValues: ADS_PLATFORM, example: "META" },
      { key: "spend", header: "Spend", type: "decimal", required: true, example: 947324 },
      { key: "impressions", header: "Impressions", type: "int", required: true, example: 17977 },
      { key: "clicks", header: "Clicks", type: "int", required: true, example: 718 },
      { key: "reach", header: "Reach", type: "int", example: 11977 },
      { key: "trackedRevenue", header: "Tracked Revenue", type: "decimal", required: true, example: 92402552 },
    ],
  },
  {
    tab: "FNB_SALES",
    model: "fnbSales",
    columns: [
      { key: "mealPeriod", header: "Meal Period", type: "enum", required: true, enumValues: MEAL_PERIOD, example: "BREAKFAST" },
      { key: "coversActual", header: "Covers Actual", type: "int", required: true, example: 2400 },
      { key: "coversBudget", header: "Covers Budget", type: "int", required: true, example: 2600 },
      { key: "revenueActual", header: "Revenue Actual", type: "decimal", required: true, example: 120000000 },
      { key: "revenueBudget", header: "Revenue Budget", type: "decimal", required: true, example: 140000000 },
    ],
  },
  {
    tab: "FNB_SOB",
    model: "fnbSourceOfBooking",
    columns: [
      { key: "sourceName", header: "Source", type: "string", required: true, example: "Chope" },
      { key: "persons", header: "Persons", type: "int", required: true, example: 450 },
      { key: "revenue", header: "Revenue", type: "decimal", required: true, example: 68000000 },
    ],
  },
  {
    tab: "FNB_ACQUISITION",
    model: "fnbAcquisition",
    columns: [
      { key: "channel", header: "Channel", type: "enum", required: true, enumValues: FNB_CHANNEL, example: "WALK_IN" },
      { key: "bookingsPct", header: "Bookings %", type: "percent", required: true, example: 0.45 },
      { key: "coversPct", header: "Covers %", type: "percent", required: true, example: 0.48 },
    ],
  },
  {
    tab: "CHOPE",
    model: "chopeReport",
    singleton: true,
    columns: [
      { key: "fulfilledBookings", header: "Fulfilled Bookings", type: "int", required: true, example: 120 },
      { key: "fulfilledCovers", header: "Fulfilled Covers", type: "int", required: true, example: 450 },
      { key: "cancelledBookings", header: "Cancelled Bookings", type: "int", required: true, example: 15 },
      { key: "cancelledCovers", header: "Cancelled Covers", type: "int", required: true, example: 40 },
      { key: "noShows", header: "No Shows", type: "int", required: true, example: 8 },
      { key: "revenue", header: "Revenue", type: "decimal", required: true, example: 68000000 },
      { key: "platformBookings", header: "Platform Bookings", type: "int", required: true, example: 90 },
      { key: "directBookings", header: "Direct Bookings", type: "int", required: true, example: 30 },
    ],
  },
  {
    tab: "GOKAI",
    model: "gokaiReport",
    columns: [
      { key: "unit", header: "Unit", type: "enum", required: true, enumValues: BUSINESS_UNIT, example: "HOTEL" },
      { key: "signups", header: "Signups", type: "int", required: true, example: 320 },
      { key: "openRatePct", header: "Open Rate %", type: "percent", required: true, example: 42.5 },
      { key: "ctrPct", header: "CTR %", type: "percent", required: true, example: 3.8 },
      { key: "surveyCompletionPct", header: "Survey Completion %", type: "percent", required: true, example: 65 },
      { key: "productViews", header: "Product Views", type: "int", required: true, example: 1400 },
      { key: "upsellSales", header: "Upsell Sales", type: "int", required: true, example: 45 },
      { key: "upsellRevenue", header: "Upsell Revenue", type: "decimal", required: true, example: 22000000 },
      { key: "refunds", header: "Refunds", type: "int", required: true, example: 3 },
    ],
  },
  {
    tab: "SPA_SALES",
    model: "spaSales",
    columns: [
      { key: "guestSegment", header: "Guest Segment", type: "enum", required: true, enumValues: SPA_SEGMENT, example: "IN_HOUSE" },
      { key: "coversActual", header: "Covers Actual", type: "int", required: true, example: 320 },
      { key: "coversBudget", header: "Covers Budget", type: "int", required: true, example: 360 },
      { key: "revenueActual", header: "Revenue Actual", type: "decimal", required: true, example: 62000000 },
      { key: "revenueBudget", header: "Revenue Budget", type: "decimal", required: true, example: 72000000 },
    ],
  },
  {
    tab: "SPA_TREATMENTS",
    model: "spaTreatment",
    columns: [
      { key: "treatmentName", header: "Treatment", type: "string", required: true, example: "Balinese Massage" },
      { key: "treatmentCount", header: "Count", type: "int", required: true, example: 180 },
      { key: "revenue", header: "Revenue", type: "decimal", required: true, example: 45000000 },
    ],
  },
  {
    tab: "REPUTATION",
    model: "platformRanking",
    columns: [
      { key: "platform", header: "Platform", type: "enum", required: true, enumValues: RANKING_PLATFORM, example: "TRIPADVISOR" },
      { key: "rank", header: "Rank", type: "int", required: true, example: 2 },
      { key: "totalInMarket", header: "Total In Market", type: "int", example: 152 },
      { key: "rating", header: "Rating", type: "decimal", example: 4.5 },
    ],
  },
  {
    tab: "SOCIAL",
    model: "socialMediaMetrics",
    columns: [
      { key: "unit", header: "Unit", type: "enum", required: true, enumValues: BUSINESS_UNIT, example: "HOTEL" },
      { key: "platform", header: "Platform", type: "enum", required: true, enumValues: SOCIAL_PLATFORM, example: "INSTAGRAM" },
      { key: "impressions", header: "Impressions", type: "int", required: true, example: 120000 },
      { key: "reach", header: "Reach", type: "int", required: true, example: 85000 },
      { key: "interactions", header: "Interactions", type: "int", required: true, example: 4200 },
      { key: "linkClicks", header: "Link Clicks", type: "int", required: true, example: 650 },
      { key: "profileVisits", header: "Profile Visits", type: "int", required: true, example: 3200 },
      { key: "followersGained", header: "Followers Gained", type: "int", required: true, example: 320 },
    ],
  },
  {
    tab: "PACE",
    model: "bookingPace",
    columns: [
      { key: "snapshotDate", header: "Snapshot Date", type: "date", required: true, example: "2026-06-30" },
      { key: "targetMonth", header: "Target Month", type: "date", required: true, example: "2026-07-01" },
      { key: "occupancyOnBooks", header: "Occupancy On Books", type: "percent", required: true, example: 0.62 },
      { key: "previousSnapshotOcc", header: "Previous Snapshot Occ", type: "percent", example: 0.55 },
      { key: "marketDemandPct", header: "Market Demand %", type: "percent", example: 0.78 },
      { key: "note", header: "Note", type: "string", required: true, example: "Strong pace for July" },
    ],
  },
  {
    tab: "FORECAST",
    model: "forecast",
    columns: [
      { key: "targetMonth", header: "Target Month", type: "date", required: true, example: "2026-07-01" },
      { key: "forecastOccPct", header: "Forecast Occ %", type: "percent", required: true, example: 0.77 },
      { key: "lastYearOccPct", header: "Last Year Occ %", type: "percent", example: "" },
      { key: "marketDemandPct", header: "Market Demand %", type: "percent", example: "" },
      { key: "forecastRevenue", header: "Forecast Revenue", type: "decimal", example: 1024166625 },
      { key: "budgetRevenue", header: "Budget Revenue", type: "decimal", example: 1235342005 },
    ],
  },
  {
    tab: "INFLUENCERS",
    model: "influencerCollab",
    columns: [
      { key: "handle", header: "Handle", type: "string", required: true, example: "@baliwanderer" },
      { key: "name", header: "Name", type: "string", required: true, example: "Bali Wanderer" },
      { key: "followers", header: "Followers", type: "int", required: true, example: 125000 },
      { key: "origin", header: "Origin", type: "string", required: true, example: "Australia" },
      { key: "notes", header: "Notes", type: "string", example: "3-night stay, reel + stories" },
    ],
  },
];

export const META_TAB = "_meta";

export function domainByTab(tab: string): DomainSpec | undefined {
  return DOMAINS.find((d) => d.tab === tab);
}
