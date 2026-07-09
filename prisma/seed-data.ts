/**
 * Shared demo seed data for the BK Sales Dashboard.
 *
 * One source of truth consumed by:
 *   - prisma/seed.ts        → seeds Supabase via Prisma (`npm run db:seed`)
 *   - prisma/gen-seed-sql.ts → generates prisma/seed.sql for the SQL editor
 *
 * The three properties are real. The BKDS June 2026 ReportPeriod uses REAL
 * values from the source workbook where available (executive summary, market
 * segment, nationality, accounts, ads, ranking, forecast) and realistic
 * placeholder values elsewhere (room types, LOS, F&B, spa, CRM, social,
 * booking pace, narrative, influencers) — to be replaced with real data later.
 */

import type { Prisma } from "@prisma/client";

/** Stable ids so the Prisma seed and the generated SQL stay in sync. */
export const BKDS_ID = "prop_bkds";
export const BKDU_ID = "prop_bkdu";
export const BKV_ID = "prop_bkv";
export const BKDS_JUNE_PERIOD_ID = "rp_bkds_2026_06";
export const BKDS_JUNE_PERIOD = "2026-06-01";

export const properties: (Prisma.PropertyCreateManyInput & { id: string })[] = [
  {
    id: BKDS_ID,
    code: "BKDS",
    name: "Blue Karma Dijiwa Seminyak",
    restaurantName: "BKeto",
    spaName: "Mudara",
    roomCount: 18,
    area: "Seminyak",
  },
  {
    id: BKDU_ID,
    code: "BKDU",
    name: "Blue Karma Dijiwa Ubud",
    restaurantName: "Botanist",
    spaName: "Flying Bamboo",
    roomCount: 20,
    area: "Ubud",
  },
  {
    id: BKV_ID,
    code: "BKV",
    name: "Blue Karma Village",
    restaurantName: "Hiiragi",
    spaName: "Heiwa",
    roomCount: 15,
    area: "Umalas",
  },
];

// Child rows for the BKDS June 2026 demo period. `periodId` is injected by the
// consumer, so it is omitted here.
type NoPeriod<T> = Omit<T, "periodId">;

export const revenueSummaries: NoPeriod<Prisma.RevenueSummaryCreateManyInput>[] =
  [
    { department: "OCCUPANCY", actual: 0.8407, budget: 0.9019 },
    { department: "ADR", actual: 1866289, budget: 2237461 },
    { department: "REVPAR", actual: 1569065, budget: 2017858 },
    { department: "ROOM_REVENUE", actual: 847295151, budget: 1089643475 },
    { department: "FNB", actual: 409394578, budget: 480485836 },
    { department: "SPA_WELLNESS", actual: 108393715, budget: 136205434 },
    { department: "GALLERY", actual: 0, budget: 21792870 },
    { department: "OOD", actual: 18888248, budget: 19613583 },
    { department: "TOTAL_REVENUE", actual: 1383971692, budget: 1747741198 },
  ];

export const segmentProduction: NoPeriod<Prisma.SegmentProductionCreateManyInput>[] =
  [
    // Actual MTD
    { scope: "MTD", series: "ACTUAL", segmentName: "Walk In", roomNights: 0, arr: 0, roomRevenue: 0 },
    { scope: "MTD", series: "ACTUAL", segmentName: "Direct Booking", roomNights: 6, arr: 1798310.5, roomRevenue: 10789863 },
    { scope: "MTD", series: "ACTUAL", segmentName: "Website", roomNights: 88, arr: 1922521.07, roomRevenue: 169181854 },
    { scope: "MTD", series: "ACTUAL", segmentName: "OTA (Online Travel Agent)", roomNights: 289, arr: 1912489.08, roomRevenue: 552709343 },
    { scope: "MTD", series: "ACTUAL", segmentName: "Local TA", roomNights: 36, arr: 1941391.19, roomRevenue: 69890083 },
    { scope: "MTD", series: "ACTUAL", segmentName: "Overseas TA", roomNights: 8, arr: 853382.88, roomRevenue: 6827063 },
    { scope: "MTD", series: "ACTUAL", segmentName: "B2B", roomNights: 27, arr: 1403590.56, roomRevenue: 37896945 },
    // Budget MTD
    { scope: "MTD", series: "BUDGET", segmentName: "Walk In", roomNights: 3, arr: 1644344.67, roomRevenue: 4933034 },
    { scope: "MTD", series: "BUDGET", segmentName: "Direct Booking", roomNights: 32, arr: 2819019, roomRevenue: 90208608 },
    { scope: "MTD", series: "BUDGET", segmentName: "Website", roomNights: 57, arr: 2519369.42, roomRevenue: 143604057 },
    { scope: "MTD", series: "BUDGET", segmentName: "OTA (Online Travel Agent)", roomNights: 310, arr: 2217249.59, roomRevenue: 687347372 },
    { scope: "MTD", series: "BUDGET", segmentName: "Local TA", roomNights: 40, arr: 1836363.63, roomRevenue: 73454545 },
    { scope: "MTD", series: "BUDGET", segmentName: "Overseas TA", roomNights: 22, arr: 1965214.86, roomRevenue: 43234727 },
    { scope: "MTD", series: "BUDGET", segmentName: "B2B", roomNights: 23, arr: 2037440.48, roomRevenue: 46861131 },
  ];

export const roomTypeProduction: NoPeriod<Prisma.RoomTypeProductionCreateManyInput>[] =
  [
    { roomTypeName: "Deluxe Room", roomNightsActual: 210, roomNightsBudget: 230, adrActual: 1650000, adrBudget: 1900000, revenueActual: 346500000, revenueBudget: 437000000 },
    { roomTypeName: "Premier Suite", roomNightsActual: 120, roomNightsBudget: 130, adrActual: 2100000, adrBudget: 2400000, revenueActual: 252000000, revenueBudget: 312000000 },
    { roomTypeName: "Pool Villa", roomNightsActual: 90, roomNightsBudget: 100, adrActual: 2600000, adrBudget: 2900000, revenueActual: 234000000, revenueBudget: 290000000 },
    { roomTypeName: "Family Villa", roomNightsActual: 34, roomNightsBudget: 27, adrActual: 2200000, adrBudget: 2500000, revenueActual: 74800000, revenueBudget: 67500000 },
  ];

export const nationalityProduction: NoPeriod<Prisma.NationalityProductionCreateManyInput>[] =
  [
    { scope: "MTD", countryCode: "AU", countryName: "AUSTRALIA", roomNights: 184 },
    { scope: "MTD", countryCode: "GB", countryName: "UNITED KINGDOM", roomNights: 44 },
    { scope: "MTD", countryCode: "FR", countryName: "FRANCE", roomNights: 37 },
    { scope: "MTD", countryCode: "CN", countryName: "CHINA", roomNights: 22 },
    { scope: "MTD", countryCode: "IN", countryName: "INDIA", roomNights: 16 },
    { scope: "MTD", countryCode: "DE", countryName: "GERMANY", roomNights: 13 },
    { scope: "MTD", countryCode: "NZ", countryName: "NEW ZEALAND", roomNights: 12 },
    { scope: "MTD", countryCode: "SA", countryName: "SAUDI ARABIA", roomNights: 11 },
  ];

export const lengthOfStay: NoPeriod<Prisma.LengthOfStayCreateManyInput>[] = [
  { losBucket: "1", bookings: 40, roomNights: 40 },
  { losBucket: "2", bookings: 45, roomNights: 90 },
  { losBucket: "3", bookings: 38, roomNights: 114 },
  { losBucket: "4", bookings: 20, roomNights: 80 },
  { losBucket: "5", bookings: 10, roomNights: 50 },
  { losBucket: "6", bookings: 6, roomNights: 36 },
  { losBucket: "7+", bookings: 4, roomNights: 44 },
];

export const accountProduction: NoPeriod<Prisma.AccountProductionCreateManyInput>[] =
  [
    { accountName: "Booking.com", accountType: "OTA", roomNights: 1480, revenue: 2701269602 },
    { accountName: "Expedia", accountType: "OTA", roomNights: 187, revenue: 304408058 },
    { accountName: "Agoda", accountType: "OTA", roomNights: 63, revenue: 72672164 },
    { accountName: "Klook", accountType: "OTA", roomNights: 25, revenue: 23167083 },
    { accountName: "Hotelbeds", accountType: "WHOLESALER", roomNights: 43, revenue: 67872442 },
    { accountName: "G2 Travel", accountType: "WHOLESALER", roomNights: 56, revenue: 58426660 },
    { accountName: "MG Holiday", accountType: "WHOLESALER", roomNights: 36, revenue: 41899861 },
    { accountName: "Luxury Escape", accountType: "TA", roomNights: 39, revenue: 59463443 },
    { accountName: "Pegasus Indonesia Travel", accountType: "TA", roomNights: 17, revenue: 31831405 },
    { accountName: "Asian Trails Indonesia", accountType: "TA", roomNights: 14, revenue: 27085537 },
  ];

export const adsPerformance: NoPeriod<Prisma.AdsPerformanceCreateManyInput>[] = [
  { unit: "HOTEL", platform: "META", spend: 947324, impressions: 17977, clicks: 718, reach: 11977, trackedRevenue: 92402552 },
  { unit: "HOTEL", platform: "GOOGLE", spend: 15000000, impressions: 250000, clicks: 4200, reach: null, trackedRevenue: 180000000 },
  { unit: "RESTAURANT", platform: "META", spend: 5000000, impressions: 90000, clicks: 1500, reach: 60000, trackedRevenue: 25000000 },
];

export const fnbSales: NoPeriod<Prisma.FnbSalesCreateManyInput>[] = [
  { mealPeriod: "BREAKFAST", coversActual: 2400, coversBudget: 2600, revenueActual: 120000000, revenueBudget: 140000000 },
  { mealPeriod: "LUNCH", coversActual: 900, coversBudget: 1000, revenueActual: 90000000, revenueBudget: 110000000 },
  { mealPeriod: "DINNER", coversActual: 1500, coversBudget: 1700, revenueActual: 199394578, revenueBudget: 230485836 },
];

export const fnbSources: NoPeriod<Prisma.FnbSourceOfBookingCreateManyInput>[] = [
  { sourceName: "Breakfast In House", persons: 1800, revenue: 90000000 },
  { sourceName: "Dinner Outsider", persons: 700, revenue: 105000000 },
  { sourceName: "Chope", persons: 450, revenue: 68000000 },
  { sourceName: "Grab & Gojek", persons: 600, revenue: 52000000 },
];

export const fnbAcquisition: NoPeriod<Prisma.FnbAcquisitionCreateManyInput>[] = [
  { channel: "WALK_IN", bookingsPct: 0.45, coversPct: 0.48 },
  { channel: "REPEATER", bookingsPct: 0.2, coversPct: 0.18 },
  { channel: "CHOPE", bookingsPct: 0.25, coversPct: 0.24 },
  { channel: "CATERING", bookingsPct: 0.1, coversPct: 0.1 },
];

export const chopeReport: NoPeriod<Prisma.ChopeReportCreateManyInput> = {
  fulfilledBookings: 120,
  fulfilledCovers: 450,
  cancelledBookings: 15,
  cancelledCovers: 40,
  noShows: 8,
  revenue: 68000000,
  platformBookings: 90,
  directBookings: 30,
};

export const gokaiReports: NoPeriod<Prisma.GokaiReportCreateManyInput>[] = [
  { unit: "HOTEL", signups: 320, openRatePct: 42.5, ctrPct: 3.8, surveyCompletionPct: 65, productViews: 1400, upsellSales: 45, upsellRevenue: 22000000, refunds: 3 },
  { unit: "RESTAURANT", signups: 150, openRatePct: 38, ctrPct: 2.9, surveyCompletionPct: 55, productViews: 600, upsellSales: 20, upsellRevenue: 8000000, refunds: 1 },
];

export const spaSales: NoPeriod<Prisma.SpaSalesCreateManyInput>[] = [
  { guestSegment: "IN_HOUSE", coversActual: 320, coversBudget: 360, revenueActual: 62000000, revenueBudget: 72000000 },
  { guestSegment: "OUTSIDE", coversActual: 180, coversBudget: 200, revenueActual: 38393715, revenueBudget: 48000000 },
  { guestSegment: "INCLUSION", coversActual: 60, coversBudget: 70, revenueActual: 8000000, revenueBudget: 16205434 },
];

export const spaTreatments: NoPeriod<Prisma.SpaTreatmentCreateManyInput>[] = [
  { treatmentName: "Balinese Massage", treatmentCount: 180, revenue: 45000000 },
  { treatmentName: "Aromatherapy", treatmentCount: 120, revenue: 32000000 },
  { treatmentName: "Hot Stone", treatmentCount: 60, revenue: 18000000 },
  { treatmentName: "Body Scrub", treatmentCount: 45, revenue: 9393715 },
  { treatmentName: "Facial", treatmentCount: 40, revenue: 4000000 },
];

export const platformRankings: NoPeriod<Prisma.PlatformRankingCreateManyInput>[] =
  [
    { platform: "BOOKING", rank: 13, totalInMarket: 1257, rating: 8.9 },
    { platform: "TRIPADVISOR", rank: 2, totalInMarket: 152, rating: 4.5 },
    { platform: "EXPEDIA", rank: 20, totalInMarket: 800, rating: 9.0 },
  ];

export const tripadvisorMetrics: NoPeriod<Prisma.TripadvisorMetricsCreateManyInput>[] =
  [
    { unit: "HOTEL", impressions: 45000, pageVisitors: 3200, newReviews: 12, avgRating: 4.5, websiteClicks: 210, phoneCalls: 35, menuViews: null, mapViews: 180 },
    { unit: "RESTAURANT", impressions: 12000, pageVisitors: 900, newReviews: 6, avgRating: 4.4, websiteClicks: 80, phoneCalls: 20, menuViews: 300, mapViews: 90 },
  ];

export const socialMediaMetrics: NoPeriod<Prisma.SocialMediaMetricsCreateManyInput>[] =
  [
    { unit: "HOTEL", platform: "INSTAGRAM", impressions: 120000, reach: 85000, interactions: 4200, linkClicks: 650, profileVisits: 3200, followersGained: 320 },
    { unit: "HOTEL", platform: "FACEBOOK", impressions: 80000, reach: 60000, interactions: 2100, linkClicks: 400, profileVisits: 1500, followersGained: 120 },
    { unit: "RESTAURANT", platform: "INSTAGRAM", impressions: 40000, reach: 30000, interactions: 1500, linkClicks: 220, profileVisits: 900, followersGained: 90 },
  ];

export const bookingPace: NoPeriod<Prisma.BookingPaceCreateManyInput>[] = [
  { snapshotDate: "2026-06-30", targetMonth: "2026-07-01", occupancyOnBooks: 0.62, previousSnapshotOcc: 0.55, marketDemandPct: 0.78, note: "Strong pace for July, ahead of last snapshot" },
  { snapshotDate: "2026-06-30", targetMonth: "2026-08-01", occupancyOnBooks: 0.48, previousSnapshotOcc: 0.4, marketDemandPct: 0.7, note: "August building steadily" },
];

export const forecasts: NoPeriod<Prisma.ForecastCreateManyInput>[] = [
  { targetMonth: "2026-07-01", forecastOccPct: 0.77, forecastRevenue: 1024166625, budgetRevenue: 1235342005 },
  { targetMonth: "2026-08-01", forecastOccPct: 0.69, forecastRevenue: 969281852, budgetRevenue: 1238263536 },
  { targetMonth: "2026-09-01", forecastOccPct: 0.6, forecastRevenue: 737775946, budgetRevenue: 1071390613 },
  { targetMonth: "2026-10-01", forecastOccPct: 0.61, forecastRevenue: 669127107, budgetRevenue: 1034035426 },
  { targetMonth: "2026-11-01", forecastOccPct: 0.24, forecastRevenue: 237074520, budgetRevenue: 829942088 },
  { targetMonth: "2026-12-01", forecastOccPct: 0.21, forecastRevenue: 316701002, budgetRevenue: 1001349354 },
];

export const narrativeContent: NoPeriod<Prisma.NarrativeContentCreateManyInput>[] =
  [
    { section: "SUMMARY", aiGenerated: false, content: "June 2026 closed at 84% occupancy against a 90% budget, with total revenue of IDR 1.38B (79% of budget). Room revenue and ADR softened versus plan on lower-season European demand." },
    { section: "EXTERNAL_FACTORS", aiGenerated: false, content: "Bali low season with softer long-haul European arrivals; competitive OTA pricing across Seminyak compressed ADR." },
    { section: "ACTION_PLAN", aiGenerated: false, content: "Prioritise direct-booking and website campaigns for Q3, tighten OTA parity, and grow B2B/wholesale room nights to defend occupancy." },
  ];

export const influencerCollabs: NoPeriod<Prisma.InfluencerCollabCreateManyInput>[] =
  [
    { handle: "@baliwanderer", name: "Bali Wanderer", followers: 125000, origin: "Australia", notes: "3-night stay, reel + stories" },
    { handle: "@thetravelduo", name: "The Travel Duo", followers: 89000, origin: "United Kingdom", notes: "Spa feature at Mudara" },
  ];

// ─── Real June 2026 data for BKDU and BKV ────────────────────────────────────
// Executive Summary (RevenueSummary) + Market Segment (SegmentProduction, MTD)
// transcribed from the source workbooks. SPA + Wellness are combined into
// SPA_WELLNESS to match the schema. These give all three properties real
// numbers for the two Phase 2 dashboard sections.

export const BKDU_JUNE_PERIOD_ID = "rp_bkdu_2026_06";
export const BKV_JUNE_PERIOD_ID = "rp_bkv_2026_06";

export interface ExtraPeriodSeed {
  periodId: string;
  propertyId: string;
  period: string;
  revenueSummaries: NoPeriod<Prisma.RevenueSummaryCreateManyInput>[];
  segmentProduction: NoPeriod<Prisma.SegmentProductionCreateManyInput>[];
}

export const extraPeriods: ExtraPeriodSeed[] = [
  {
    periodId: BKDU_JUNE_PERIOD_ID,
    propertyId: BKDU_ID,
    period: BKDS_JUNE_PERIOD,
    revenueSummaries: [
      { department: "OCCUPANCY", actual: 0.9483, budget: 0.9317 },
      { department: "ADR", actual: 2000632, budget: 2105180 },
      { department: "REVPAR", actual: 1897266, budget: 1852184 },
      { department: "ROOM_REVENUE", actual: 1138359532, budget: 1176795454 },
      { department: "FNB", actual: 485666349, budget: 577683094 },
      { department: "SPA_WELLNESS", actual: 142258156, budget: 182403294 },
      { department: "GALLERY", actual: 0, budget: 23535909 },
      { department: "OOD", actual: 27355065, budget: 54720987 },
      { department: "TOTAL_REVENUE", actual: 1793639102, budget: 2015138738 },
    ],
    segmentProduction: [
      { scope: "MTD", series: "ACTUAL", segmentName: "Direct Booking", roomNights: 45, arr: 1973562.64, roomRevenue: 88810319 },
      { scope: "MTD", series: "ACTUAL", segmentName: "Website", roomNights: 47, arr: 1897093.89, roomRevenue: 89163413 },
      { scope: "MTD", series: "ACTUAL", segmentName: "OTA (Online Travel Agent)", roomNights: 179, arr: 1930556.02, roomRevenue: 345569528 },
      { scope: "MTD", series: "ACTUAL", segmentName: "Local TA", roomNights: 156, arr: 1681457.94, roomRevenue: 262307438 },
      { scope: "MTD", series: "ACTUAL", segmentName: "B2B", roomNights: 35, arr: 1433249.37, roomRevenue: 50163728 },
      { scope: "MTD", series: "ACTUAL", segmentName: "Group Wellness", roomNights: 107, arr: 2825655.2, roomRevenue: 302345106 },
      { scope: "MTD", series: "BUDGET", segmentName: "Walk In", roomNights: 2, arr: 2147818, roomRevenue: 4295636 },
      { scope: "MTD", series: "BUDGET", segmentName: "Direct Booking", roomNights: 32, arr: 1957688.44, roomRevenue: 62646030 },
      { scope: "MTD", series: "BUDGET", segmentName: "Website", roomNights: 116, arr: 1929354.54, roomRevenue: 223805127 },
      { scope: "MTD", series: "BUDGET", segmentName: "OTA (Online Travel Agent)", roomNights: 243, arr: 2256565.29, roomRevenue: 548345365 },
      { scope: "MTD", series: "BUDGET", segmentName: "OTA (Wellness)", roomNights: 8, arr: 1856590.88, roomRevenue: 14852727 },
      { scope: "MTD", series: "BUDGET", segmentName: "Local TA", roomNights: 88, arr: 1793820.66, roomRevenue: 157856218 },
      { scope: "MTD", series: "BUDGET", segmentName: "Overseas TA", roomNights: 12, arr: 2065702.5, roomRevenue: 24788430 },
      { scope: "MTD", series: "BUDGET", segmentName: "B2B", roomNights: 14, arr: 2090337.21, roomRevenue: 29264721 },
      { scope: "MTD", series: "BUDGET", segmentName: "Group Wellness", roomNights: 44, arr: 2521390.91, roomRevenue: 110941200 },
    ],
  },
  {
    periodId: BKV_JUNE_PERIOD_ID,
    propertyId: BKV_ID,
    period: BKDS_JUNE_PERIOD,
    revenueSummaries: [
      { department: "OCCUPANCY", actual: 0.8289, budget: 0.9022 },
      { department: "ADR", actual: 2242597, budget: 2670173 },
      { department: "REVPAR", actual: 1858864, budget: 2409089 },
      { department: "ROOM_REVENUE", actual: 836488607, budget: 1084090162 },
      { department: "FNB", actual: 430558073, budget: 513130002 },
      { department: "SPA_WELLNESS", actual: 101791608, budget: 150688532 },
      { department: "GALLERY", actual: 0, budget: 31438615 },
      { department: "OOD", actual: 20524115, budget: 19513623 },
      { department: "TOTAL_REVENUE", actual: 1389362403, budget: 1798860934 },
    ],
    segmentProduction: [
      { scope: "MTD", series: "ACTUAL", segmentName: "Direct Booking", roomNights: 20, arr: 2285553.1, roomRevenue: 45711062 },
      { scope: "MTD", series: "ACTUAL", segmentName: "Website", roomNights: 71, arr: 2160155.28, roomRevenue: 153371025 },
      { scope: "MTD", series: "ACTUAL", segmentName: "OTA (Online Travel Agent)", roomNights: 243, arr: 2333554.56, roomRevenue: 567053759 },
      { scope: "MTD", series: "ACTUAL", segmentName: "Local TA", roomNights: 15, arr: 2110646.2, roomRevenue: 31659693 },
      { scope: "MTD", series: "ACTUAL", segmentName: "Overseas TA", roomNights: 4, arr: 1150945, roomRevenue: 4603780 },
      { scope: "MTD", series: "ACTUAL", segmentName: "B2B", roomNights: 20, arr: 1704464.4, roomRevenue: 34089288 },
      { scope: "MTD", series: "BUDGET", segmentName: "Walk In", roomNights: 2, arr: 2178688.5, roomRevenue: 4357377 },
      { scope: "MTD", series: "BUDGET", segmentName: "Direct Booking", roomNights: 47, arr: 2437596.7, roomRevenue: 114567045 },
      { scope: "MTD", series: "BUDGET", segmentName: "Website", roomNights: 48, arr: 2621802.48, roomRevenue: 125846519 },
      { scope: "MTD", series: "BUDGET", segmentName: "OTA (Online Travel Agent)", roomNights: 229, arr: 2831976.86, roomRevenue: 648522701 },
      { scope: "MTD", series: "BUDGET", segmentName: "Local TA", roomNights: 18, arr: 2317585.11, roomRevenue: 41716532 },
      { scope: "MTD", series: "BUDGET", segmentName: "Overseas TA", roomNights: 32, arr: 2425052.06, roomRevenue: 77601666 },
      { scope: "MTD", series: "BUDGET", segmentName: "B2B", roomNights: 10, arr: 2686675.6, roomRevenue: 26866756 },
      { scope: "MTD", series: "BUDGET", segmentName: "Group Wellness", roomNights: 20, arr: 2230578.5, roomRevenue: 44611570 },
    ],
  },
];
