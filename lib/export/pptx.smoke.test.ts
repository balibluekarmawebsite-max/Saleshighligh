import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Render smoke test for the Sales Highlight deck. There is no database in CI/dev,
 * so the dashboard fetchers and the Prisma client are mocked with representative,
 * fully-populated data. The point is to drive every pptxgenjs code path the deck
 * uses (native tables with per-cell fills, grouped/line/doughnut charts, an
 * inverted rank axis, embedded images) and prove buildDeck() produces a non-empty
 * .pptx buffer without throwing — catching API misuse the type-checker can't.
 */

// ── fixtures ──────────────────────────────────────────────────────────────────
const nb = (content: string) => ({ content, aiGenerated: false });
const triple = (rn: number, arr: number, revenue: number) => ({ rn, arr, revenue });
const ab = (actual: number, budget: number, lastYear: number | null = null) => ({ actual, budget, lastYear });
const propBase = { code: "BKDS", name: "Blue Karma Dijiwa Seminyak", area: "Seminyak, Bali", roomCount: 60 };

const adsSummary = {
  totalSpend: 120_000_000,
  trackedRevenue: 980_000_000,
  roasPct: 816,
  roasRatio: 8.16,
  totalClicks: 45_000,
  totalConversions: 1_250,
  platforms: [
    { platform: "GOOGLE", spend: 70_000_000, impressions: 1_200_000, clicks: 30_000, reach: 800_000, conversions: 900, trackedRevenue: 620_000_000, ctr: 2.5, cpc: 2_333 },
    { platform: "META", spend: 50_000_000, impressions: 900_000, clicks: 15_000, reach: null, conversions: 350, trackedRevenue: 360_000_000, ctr: 1.6, cpc: 3_333 },
  ],
};
const spendRevenue = [
  { platform: "GOOGLE", spend: 70_000_000, revenue: 620_000_000 },
  { platform: "META", spend: 50_000_000, revenue: 360_000_000 },
];
const tripadvisor = {
  rank: 3,
  totalInMarket: 120,
  rating: 4.6,
  area: "Seminyak",
  noun: "hotels",
  metrics: [
    { key: "impressions", label: "Listing Impressions", value: 12_000, mom: 12.5, reportedMom: 12.5 },
    { key: "pageVisitors", label: "Unique Page Visitors", value: 3_400, mom: -4.2, reportedMom: -4.2 },
  ],
};

const summaryData = {
  property: propBase,
  period: "2026-06",
  hasData: true,
  status: "DRAFT",
  dataAsOf: "2026-06-30",
  metrics: {
    occupancy: ab(0.72, 0.68),
    adr: ab(1_850_000, 1_800_000),
    revpar: ab(1_332_000, 1_224_000),
    totalRevenue: ab(4_600_000_000, 4_200_000_000),
    roomRevenue: ab(3_100_000_000, 2_900_000_000),
  },
  revenueLines: [
    { department: "OCCUPANCY", label: "Occupancy", actual: 0.72, budget: 0.68, lastYear: 0.65, format: "ratio" as const },
    { department: "ADR", label: "ADR", actual: 1_850_000, budget: 1_800_000, lastYear: 1_700_000, format: "idr" as const },
    { department: "ROOM_REVENUE", label: "Room Revenue", actual: 3_100_000_000, budget: 2_900_000_000, lastYear: 2_700_000_000, format: "idr" as const },
    { department: "FNB", label: "F&B", actual: 900_000_000, budget: 850_000_000, lastYear: 800_000_000, format: "idr" as const },
  ],
  mix: [
    { key: "ROOM_REVENUE", label: "Rooms", value: 3_100_000_000 },
    { key: "FNB", label: "F&B", value: 900_000_000 },
    { key: "SPA_WELLNESS", label: "Spa & Wellness", value: 400_000_000 },
    { key: "GALLERY", label: "Gallery", value: 120_000_000 },
    { key: "OOD", label: "Other", value: 80_000_000 },
  ],
  narratives: { summary: nb("A strong June, ahead of budget on rooms."), external: nb("Low season regionally."), internal: nb("New wholesale account onboarded.") },
  forecasts: [
    { month: "2026-07", forecastOcc: 74, lastYearOcc: 66, marketDemand: 70 },
    { month: "2026-08", forecastOcc: 80, lastYearOcc: 72, marketDemand: 78 },
    { month: "2026-09", forecastOcc: 68, lastYearOcc: 64, marketDemand: 66 },
  ],
};

const segmentsData = {
  property: propBase,
  period: "2026-06",
  scope: "MTD" as const,
  hasData: true,
  status: "DRAFT",
  segments: [
    { name: "OTA", actual: triple(600, 1_850_000, 1_110_000_000), budget: triple(560, 1_800_000, 1_008_000_000), lastYear: triple(520, 1_700_000, 884_000_000) },
    { name: "Corporate", actual: triple(300, 1_900_000, 570_000_000), budget: triple(320, 1_850_000, 592_000_000), lastYear: triple(280, 1_750_000, 490_000_000) },
    { name: "Wholesale", actual: triple(200, 1_400_000, 280_000_000), budget: triple(180, 1_450_000, 261_000_000), lastYear: null },
  ],
  totals: {
    actual: triple(1_100, 1_781_818, 1_960_000_000),
    budget: triple(1_060, 1_755_660, 1_861_000_000),
    lastYear: triple(1_080, 1_727_777, 1_866_000_000),
  },
  accounts: Array.from({ length: 20 }, (_, i) => ({
    rank: i + 1,
    accountName: `Account ${i + 1}`,
    accountType: "OTA",
    roomNights: 500 - i * 20,
    revenue: (500 - i * 20) * 1_800_000,
    pctOfRevenue: Math.max(1, 15 - i),
  })),
  accountsTotalRevenue: 2_000_000_000,
};

const roomTypesData = {
  property: propBase,
  period: "2026-06",
  hasData: true,
  status: "DRAFT",
  roomTypes: [
    { roomTypeName: "Deluxe", roomCode: "DLX", roomNightsActual: 600, adrActual: 1_800_000, revenueActual: 1_080_000_000, pctOfRevenue: 55 },
    { roomTypeName: "Suite", roomCode: "STE", roomNightsActual: 300, adrActual: 2_400_000, revenueActual: 720_000_000, pctOfRevenue: 37 },
    { roomTypeName: "Villa", roomCode: "VIL", roomNightsActual: 50, adrActual: 3_200_000, revenueActual: 160_000_000, pctOfRevenue: 8 },
  ],
  narrative: nb("Suites outperformed on rate."),
};

const guestsData = {
  property: propBase,
  period: "2026-06",
  scope: "MTD" as const,
  hasData: true,
  nationalities: [
    { rank: 1, countryName: "Australia", countryCode: "AU", roomNights: 400, sharePct: 36, lastYearRoomNights: 350, rankMovement: 1 },
    { rank: 2, countryName: "United States", countryCode: "US", roomNights: 200, sharePct: 18, lastYearRoomNights: 240, rankMovement: -1 },
    { rank: 3, countryName: "Japan", countryCode: "JP", roomNights: 120, sharePct: 11, lastYearRoomNights: null, rankMovement: null },
  ],
  losBuckets: [
    { bucket: "1", bookings: 120, roomNights: 120, lastYearRoomNights: 100, sharePct: 20 },
    { bucket: "2", bookings: 150, roomNights: 300, lastYearRoomNights: 280, sharePct: 30 },
    { bucket: "3+", bookings: 100, roomNights: 500, lastYearRoomNights: 420, sharePct: 50 },
  ],
  avgLos: 2.4,
  share3Plus: 50,
  dominantBucket: "3+",
};

const marketingData = {
  property: propBase,
  period: "2026-06",
  hasData: true,
  ads: adsSummary,
  roasTrend: [
    { month: "2026-05", roasPct: 700 },
    { month: "2026-06", roasPct: 816 },
  ],
  spendRevenue,
  rankCards: [
    { platform: "BOOKING", rank: 4, totalInMarket: 200, rating: 9.1, change: 2 },
    { platform: "EXPEDIA", rank: 6, totalInMarket: 180, rating: 9.0, change: -1 },
    { platform: "TRIPADVISOR", rank: 3, totalInMarket: 120, rating: 4.6, change: 0 },
  ],
  rankTrend: [
    { month: "2026-04", BOOKING: 6, EXPEDIA: 7, TRIPADVISOR: 5 },
    { month: "2026-05", BOOKING: 5, EXPEDIA: 6, TRIPADVISOR: 4 },
    { month: "2026-06", BOOKING: 4, EXPEDIA: 6, TRIPADVISOR: 3 },
  ],
  rankHistory: [
    { period: "2026-05", month: "May 2026", BOOKING: { rank: 5, totalInMarket: 200, rating: 9.0 }, EXPEDIA: { rank: 6, totalInMarket: 180, rating: 9.0 }, TRIPADVISOR: { rank: 4, totalInMarket: 120, rating: 4.5 } },
    { period: "2026-06", month: "June 2026", BOOKING: { rank: 4, totalInMarket: 200, rating: 9.1 }, EXPEDIA: null, TRIPADVISOR: { rank: 3, totalInMarket: 120, rating: 4.6 } },
  ],
  tripadvisor,
};

const restaurantData = {
  property: { code: "BKDS", name: propBase.name, area: propBase.area, restaurantName: "BKeto" },
  period: "2026-06",
  hasData: true,
  status: "DRAFT",
  overview: { covers: ab(3_000, 2_800), revenue: ab(900_000_000, 850_000_000), avgCheckActual: 300_000, avgCheckBudget: 303_000, revenueAchievementPct: 105.9 },
  meals: [
    { meal: "BREAKFAST", coversActual: 1_200, coversBudget: 1_100, revenueActual: 240_000_000, revenueBudget: 220_000_000, avgCheckActual: 200_000, avgCheckBudget: 200_000, pctOfRevenue: 26.7 },
    { meal: "LUNCH", coversActual: 800, coversBudget: 800, revenueActual: 240_000_000, revenueBudget: 240_000_000, avgCheckActual: 300_000, avgCheckBudget: 300_000, pctOfRevenue: 26.7 },
    { meal: "DINNER", coversActual: 1_000, coversBudget: 900, revenueActual: 420_000_000, revenueBudget: 390_000_000, avgCheckActual: 420_000, avgCheckBudget: 433_000, pctOfRevenue: 46.6 },
  ],
  restaurantRevenueActual: 900_000_000,
  restaurantRevenueBudget: 850_000_000,
  sources: [
    { sourceName: "In-House Guests", category: "IN_HOUSE" as const, persons: 1_800, revenue: 540_000_000, avgCheck: 300_000, pctPersons: 60 },
    { sourceName: "Walk-in", category: "OUTSIDER" as const, persons: 900, revenue: 270_000_000, avgCheck: 300_000, pctPersons: 30 },
    { sourceName: "Chope", category: "PLATFORM" as const, persons: 300, revenue: 90_000_000, avgCheck: 300_000, pctPersons: 10 },
  ],
  acquisition: [
    { channel: "Walk-in", label: "Walk-in", bookingsPct: 40, coversPct: 38 },
    { channel: "Repeater", label: "Repeater", bookingsPct: 35, coversPct: 37 },
    { channel: "Chope", label: "Chope", bookingsPct: 25, coversPct: 25 },
  ],
  acquisitionDaily: Array.from({ length: 10 }, (_, i) => ({ day: i + 1, bookings: 20 + i, covers: 40 + i * 2 })),
  acquisitionNarrative: nb("Repeaters drove covers this month."),
  chope: {
    fulfilledBookings: 220, fulfilledCovers: 540, cancelledBookings: 20, cancelledCovers: 48, noShows: 10, noShowCovers: 24,
    upcomingBookings: 5, upcomingCovers: 12, walkinBookings: 30, walkinCovers: 70, revenue: 90_000_000,
    platformBookings: 180, platformCovers: 430, directBookings: 70, directCovers: 170, averagePartySize: 2.4,
    pctOfRestaurantRevenue: 10, revenuePctGiven: 10,
  },
  chopeDaily: Array.from({ length: 10 }, (_, i) => ({ day: i + 1, platformBookings: 6 + i, directBookings: 2 + i })),
  chopeNarrative: nb("Chope volume steady."),
  gokai: { unit: "RESTAURANT", metrics: [{ key: "signups", label: "Sign-ups", value: 320, format: "number" as const, mom: 8 }, { key: "openRate", label: "Open Rate", value: 42, format: "pct" as const, mom: -2 }] },
  gokaiNarrative: nb("Upsell tools performing well."),
  ads: adsSummary,
  spendRevenue,
  roasTrend: marketingData.roasTrend,
  tripadvisor: { ...tripadvisor, noun: "restaurants" },
  tripadvisorNarrative: nb("Restaurant reviews improving."),
  narrative: nb("😊 Strong dinner covers\n☹️ Lunch flat\n💡 Push set menus"),
};

const spaData = {
  property: { code: "BKDS", name: propBase.name, area: propBase.area, spaName: "Mudara" },
  period: "2026-06",
  hasData: true,
  status: "DRAFT",
  overview: { covers: ab(800, 760), revenue: ab(400_000_000, 380_000_000), avgCheckActual: 500_000, avgCheckBudget: 500_000, revenueAchievementPct: 105.3 },
  segments: [
    { segment: "IN_HOUSE", coversActual: 500, coversBudget: 480, revenueActual: 250_000_000, revenueBudget: 240_000_000, avgCheckActual: 500_000, avgCheckBudget: 500_000 },
    { segment: "OUTSIDE", coversActual: 200, coversBudget: 180, revenueActual: 110_000_000, revenueBudget: 99_000_000, avgCheckActual: 550_000, avgCheckBudget: 550_000 },
    { segment: "INCLUSION", coversActual: 100, coversBudget: 100, revenueActual: 40_000_000, revenueBudget: 41_000_000, avgCheckActual: 400_000, avgCheckBudget: 410_000 },
  ],
  treatments: [
    { rank: 1, treatmentName: "Balinese Massage", count: 300, revenue: 150_000_000, avgPrice: 500_000 },
    { rank: 2, treatmentName: "Facial", count: 200, revenue: 90_000_000, avgPrice: 450_000 },
  ],
  treatmentsAll: [],
  ads: adsSummary,
  spendRevenue,
  roasTrend: marketingData.roasTrend,
  gokai: { unit: "HOTEL", metrics: [{ key: "views", label: "Product Views", value: 1_200, format: "number" as const, mom: 5 }] },
  tripadvisor: { ...tripadvisor, noun: "Spas & Wellness" },
  narrative: nb("😊 Outside guests up\n☹️ Inclusion soft\n💡 Bundle with dinner"),
  gokaiNarrative: nb("Spa upsell steady (hotel-level)."),
  tripadvisorNarrative: nb("Spa listing engagement up."),
};

const marketData = {
  property: propBase,
  period: "2026-06",
  hasData: true,
  status: "DRAFT",
  pace: [],
  paceAsOf: null,
  forecasts: [],
  revenueForecast: [],
  revenueForecastCumulativeGap: null,
  supply: [],
  demandRange: null,
  marketArea: [
    { month: "2026-05", monthLabel: "May", propertyRoomNights: 1_000, marketRoomNights: 1_200, propertyAdr: 1_800_000, marketAdr: 1_700_000 },
    { month: "2026-06", monthLabel: "Jun", propertyRoomNights: 1_100, marketRoomNights: 1_300, propertyAdr: 1_850_000, marketAdr: 1_750_000 },
  ],
  bookingWindow: {
    windowLabel: "Last 90 days",
    dataAsOf: "2026-11-03",
    totalBookedRooms: 211,
    buckets: [
      { bucket: "0–1 day", propertySharePct: 17.5, marketSharePct: 26, propertyAdr: 3_200_000, marketAdr: 1_500_000 },
      { bucket: "2–3 days", propertySharePct: 9.5, marketSharePct: 10, propertyAdr: 2_900_000, marketAdr: 1_700_000 },
      { bucket: "4–7 days", propertySharePct: 11.5, marketSharePct: 7.5, propertyAdr: 3_000_000, marketAdr: 1_900_000 },
      { bucket: "8–14 days", propertySharePct: 8, marketSharePct: 8.5, propertyAdr: 3_300_000, marketAdr: 2_100_000 },
      { bucket: "15–30 days", propertySharePct: 11, marketSharePct: 12.5, propertyAdr: 4_000_000, marketAdr: 2_500_000 },
      { bucket: "31–60 days", propertySharePct: 10.5, marketSharePct: 10, propertyAdr: 3_900_000, marketAdr: 2_700_000 },
      { bucket: "61–90 days", propertySharePct: 10, marketSharePct: 8, propertyAdr: 3_800_000, marketAdr: 2_800_000 },
      { bucket: "91+ days", propertySharePct: 24, marketSharePct: 21, propertyAdr: 3_900_000, marketAdr: 2_900_000 },
      { bucket: "Unspecified", propertySharePct: 0, marketSharePct: 0, propertyAdr: 0, marketAdr: 0 },
    ],
  },
  bookingOverview: {
    windowLabel: "Last 30 days",
    dataAsOf: "2026-06-30",
    searchResultsViews: 50_000, searchResultsViewsVsMkt: 5,
    propertyPageVisits: 8_000, propertyPageVisitsVsMkt: -2,
    bookingsMade: 400, bookingsMadeVsMkt: 3,
    searchToPagePct: 16, searchToPageMarketPct: 15, searchToPageVsMkt: 1,
    pageToBookingPct: 5, pageToBookingMarketPct: 4.5, pageToBookingVsMkt: 0.5,
    availabilityPct: 92, availabilityVsMkt: 2,
    availability: [
      { month: "2026-05", monthLabel: "May", yourPct: 90, marketPct: 88 },
      { month: "2026-06", monthLabel: "Jun", yourPct: 92, marketPct: 89 },
    ],
  },
  sojern: {
    destination: "Bali",
    originCountry: "Australia",
    eventType: "Flight & Hotel searches",
    timePeriod: "Jun 2026",
    baselineLabel: "2019 baseline",
    years: [2025, 2026],
    flight: [
      { month: "Jan", "2025": 90, "2026": 110 },
      { month: "Feb", "2025": 95, "2026": 115 },
    ],
    hotel: [
      { month: "Jan", "2025": 88, "2026": 108 },
      { month: "Feb", "2025": 92, "2026": 112 },
    ],
    points: [{ metric: "flight", year: 2026, month: 1, valuePct: 110 }],
  },
  narrative: nb("Legacy market intel — should NOT appear."),
  marketAreaNarrative: nb("Property outpaced market on ADR."),
  bookingWindowNarrative: nb(
    [
      "Data Overview:",
      "- Analysis Period: Last 90 days",
      "- Data as of: 2026-11-03",
      "- Total Booked Rooms: 211",
      "- Benchmark: Market",
      "",
      "Booking Pattern Analysis:",
      "Short-Term Bookings (0–14 days):",
      "- 0–1 day: 17.5% of bookings",
      "- 2–3 days: 9.5% of bookings",
      "- 4–7 days: 11.5% of bookings",
      "- 8–14 days: 8.0% of bookings",
      "",
      "Mid to Long-Term Bookings (15–90+ days):",
      "- 15–30 days: 11.0% of bookings",
      "- 31–60 days: 10.5% of bookings",
      "- 61–90 days: 10.0% of bookings",
      "- 91+ days: 24.0% of bookings (highest share)",
      "",
      "Rate Positioning (ADR vs Market):",
      "- Property ADR is above market in every bucket",
      "- Highest property ADR: Rp 4.0 M in the 15–30 days window",
      "- Property ADR range: Rp 2.9 M to Rp 4.0 M",
      "- Market ADR range: Rp 1.5 M to Rp 2.9 M",
    ].join("\n"),
  ),
  bookingOverviewNarrative: nb("Conversion ahead of market."),
  sojernNarrative: nb("Flight intent recovering."),
  alerts: [],
};

const plansData = {
  property: { code: "BKDS", name: propBase.name, area: propBase.area, restaurantName: "BKeto", spaName: "Mudara" },
  period: "2026-06",
  hasData: true,
  sections: {
    ACTION_PLAN: { current: nb("Push direct bookings."), previous: null },
    PROMOTIONS: { current: nb("Stay 3 pay 2."), previous: null },
  },
  // URLs that don't resolve on disk → the image is skipped (no fs in tests).
  promoImages: { ROOMS: [{ id: "p1", unit: "ROOMS", imageUrl: "/uploads/plans/promo/x.png", caption: "Stay 3 Pay 2", sortOrder: 0 }], RESTAURANT: [], SPA: [], WELLNESS: [] },
};

const socialData = {
  property: { code: "BKDS", name: propBase.name, area: propBase.area, restaurantName: "BKeto", spaName: "Mudara" },
  period: "2026-06",
  hasData: true,
  units: [
    {
      unit: "HOTEL",
      hasData: true,
      platforms: [
        { platform: "INSTAGRAM", hasData: true, metrics: [{ key: "impressions", label: "Impressions", value: 500_000, mom: 12, trend: [1, 2, 3] }, { key: "reach", label: "Reach", value: 300_000, mom: 8, trend: [1, 2, 3] }, { key: "linkClicks", label: "Link Clicks", value: null, mom: null, trend: [] }], narrative: "Instagram grew on reach." },
        { platform: "FACEBOOK", hasData: true, metrics: [{ key: "impressions", label: "Impressions", value: 200_000, mom: -5, trend: [3, 2, 1] }, { key: "reach", label: "Reach", value: 120_000, mom: 3, trend: [1, 1, 2] }], narrative: "Facebook steady." },
        { platform: "TIKTOK", hasData: true, metrics: [{ key: "impressions", label: "Impressions", value: 80_000, mom: 40, trend: [1, 2, 4] }], narrative: "TikTok ramping." },
      ],
      summary: "Strong month.",
    },
  ],
  influencers: [
    { id: "i1", handle: "@travelbali", name: "Travel Bali", followers: 120_000, origin: "Australia", notes: "3-night stay, 2 reels.", imageUrl: "/uploads/influencers/x.png" },
  ],
};

// ── mocks ───────────────────────────────────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: { property: { findUnique: vi.fn(async () => propBase) } },
}));

vi.mock("@/lib/dashboard-data", () => ({
  getSummaryPageData: vi.fn(async () => summaryData),
  getSegmentsPageData: vi.fn(async (_c: string, _p: string, scope: "MTD" | "YTD") => ({ ...segmentsData, scope })),
  getRoomTypesPageData: vi.fn(async () => roomTypesData),
  getGuestsPageData: vi.fn(async () => guestsData),
  getMarketingPageData: vi.fn(async () => marketingData),
  getRestaurantPageData: vi.fn(async () => restaurantData),
  getSpaPageData: vi.fn(async () => spaData),
  getMarketPageData: vi.fn(async () => marketData),
  getPlansPageData: vi.fn(async () => plansData),
  getSocialPageData: vi.fn(async () => socialData),
}));

describe("buildDeck (render smoke)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a full deck to a non-empty .pptx buffer", async () => {
    const { buildDeck, DEFAULT_SECTION_IDS } = await import("./pptx");
    const result = await buildDeck("BKDS", "2026-06", DEFAULT_SECTION_IDS);
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe("BKDS-2026-06-sales-highlight.pptx");
    // A PPTX is a ZIP — first bytes are "PK".
    expect(result!.buffer.length).toBeGreaterThan(10_000);
    expect(result!.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    if (process.env.PPTX_DUMP) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.PPTX_DUMP, result!.buffer);
    }
  });

  it("renders when a property is missing (returns null)", async () => {
    const { prisma } = await import("@/lib/prisma");
    (prisma.property.findUnique as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(null);
    const { buildDeck } = await import("./pptx");
    const result = await buildDeck("NOPE", "2026-06", ["summary"]);
    expect(result).toBeNull();
  });

  it("renders empty sections without throwing (no data)", async () => {
    const dd = await import("@/lib/dashboard-data");
    (dd.getSummaryPageData as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ ...summaryData, hasData: false });
    const { buildDeck } = await import("./pptx");
    const result = await buildDeck("BKDS", "2026-06", ["summary"]);
    expect(result).not.toBeNull();
    expect(result!.buffer.length).toBeGreaterThan(5_000);
  });
});
