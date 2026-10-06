import { PrismaClient } from "@prisma/client";

/**
 * Seed one fully-populated demo Weekly Report for BKDS — the week of
 * 25 Sep – 1 Oct 2026 (Fri–Thu). Idempotent: the week is upserted by a fixed
 * id and its child rows are cleared and re-created on each run.
 *
 *   npm run db:seed:weekly   (run after `npm run db:seed`, which seeds properties)
 */

const prisma = new PrismaClient();

const WEEK_ID = "wk_bkds_2026w40_demo";
const START = new Date("2026-09-25T00:00:00.000Z");
const END = new Date("2026-10-01T00:00:00.000Z");

/** Per-month Actual / Budget / Last-Year figures (occ as a 0–1 fraction). */
const MONTHLY = [
  { month: 1, rnSold: 452, occActual: 0.81, occBudget: 0.84, occLy: 0.78, arrActual: 1_980_000, arrBudget: 2_050_000, arrLy: 1_890_000, revActual: 895_000_000, revBudget: 965_000_000, revLy: 840_000_000 },
  { month: 2, rnSold: 430, occActual: 0.85, occBudget: 0.86, occLy: 0.80, arrActual: 2_050_000, arrBudget: 2_100_000, arrLy: 1_940_000, revActual: 881_500_000, revBudget: 930_000_000, revLy: 812_000_000 },
  { month: 3, rnSold: 470, occActual: 0.84, occBudget: 0.88, occLy: 0.81, arrActual: 2_010_000, arrBudget: 2_120_000, arrLy: 1_920_000, revActual: 944_700_000, revBudget: 1_010_000_000, revLy: 868_000_000 },
  { month: 4, rnSold: 441, occActual: 0.82, occBudget: 0.87, occLy: 0.79, arrActual: 1_950_000, arrBudget: 2_080_000, arrLy: 1_880_000, revActual: 859_950_000, revBudget: 965_000_000, revLy: 806_000_000 },
  { month: 5, rnSold: 468, occActual: 0.84, occBudget: 0.86, occLy: 0.82, arrActual: 1_990_000, arrBudget: 2_060_000, arrLy: 1_900_000, revActual: 931_320_000, revBudget: 980_000_000, revLy: 872_000_000 },
  { month: 6, rnSold: 454, occActual: 0.84, occBudget: 0.90, occLy: 0.80, arrActual: 1_866_289, arrBudget: 2_237_461, arrLy: 1_820_000, revActual: 847_295_151, revBudget: 1_089_643_475, revLy: 826_000_000 },
  { month: 7, rnSold: 489, occActual: 0.88, occBudget: 0.89, occLy: 0.84, arrActual: 2_080_000, arrBudget: 2_150_000, arrLy: 1_980_000, revActual: 1_017_120_000, revBudget: 1_060_000_000, revLy: 942_000_000 },
  { month: 8, rnSold: 495, occActual: 0.89, occBudget: 0.90, occLy: 0.85, arrActual: 2_120_000, arrBudget: 2_180_000, arrLy: 2_010_000, revActual: 1_049_400_000, revBudget: 1_095_000_000, revLy: 968_000_000 },
  { month: 9, rnSold: 463, occActual: 0.86, occBudget: 0.88, occLy: 0.82, arrActual: 2_030_000, arrBudget: 2_120_000, arrLy: 1_930_000, revActual: 939_890_000, revBudget: 1_005_000_000, revLy: 862_000_000 },
  { month: 10, rnSold: 112, occActual: 0.77, occBudget: 0.90, occLy: 0.81, arrActual: 1_866_289, arrBudget: 2_237_461, arrLy: 1_900_000, revActual: 209_024_368, revBudget: 272_410_869, revLy: 214_000_000 },
];

/** Channel Inside — room nights per source (year 2026), Jan–Oct filled. */
const CHANNELS = [
  { sourceLabel: "Booking.com", rn: [160, 150, 168, 150, 165, 158, 176, 180, 164, 42] },
  { sourceLabel: "Expedia", rn: [92, 88, 95, 90, 96, 92, 101, 104, 95, 22] },
  { sourceLabel: "Agoda", rn: [70, 66, 74, 70, 73, 70, 78, 80, 72, 18] },
  { sourceLabel: "Website (ALARIC)", rn: [78, 74, 80, 76, 80, 78, 86, 86, 78, 20] },
  { sourceLabel: "Direct / Reservation", rn: [52, 52, 53, 55, 54, 56, 48, 45, 54, 10] },
];

/** This week's production by market segment (last 7 days). */
const SEGMENTS = [
  { label: "OTA", segmentGroup: "OTA", rnSold: 58, grossRevenue: 108_200_000 },
  { label: "Direct / Website", segmentGroup: "Website", rnSold: 24, grossRevenue: 49_600_000 },
  { label: "Offline Travel Agent", segmentGroup: "Offline TA", rnSold: 14, grossRevenue: 25_800_000 },
  { label: "Corporate / B2B", segmentGroup: "B2B", rnSold: 10, grossRevenue: 17_500_000 },
  { label: "Complimentary", segmentGroup: "Compliment", rnSold: 6, grossRevenue: 0 },
];

/** Section A overview blocks (7). A few filled so the progress panel is realistic. */
const OVERVIEW = [
  { key: "financial", heading: "1. Financial", sortOrder: 0, aiDraft: true, body: "As of 1 Oct 2026, YTD room revenue is tracking slightly below budget, driven by a softer October open; occupancy for the headline month is 77.0% vs a 90.0% budget (−13.0 pts)." },
  { key: "market", heading: "2. Market Overview", sortOrder: 1, aiDraft: true, body: "Seminyak demand held steady week-on-week; Booking.com remained the strongest channel, and the direct website share continued to grow." },
  { key: "pace", heading: "3. Pace Report", sortOrder: 2, aiDraft: false, body: null },
  { key: "countries", heading: "4. Countries", sortOrder: 3, aiDraft: false, body: null },
  { key: "booking_window", heading: "5. Booking Window", sortOrder: 4, aiDraft: false, body: null },
  { key: "booking_ranking", heading: "6. Booking.com Ranking", sortOrder: 5, aiDraft: false, body: null },
  { key: "learning", heading: "7. Learning & Growth / Trainings", sortOrder: 6, aiDraft: false, body: "Front-office upselling refresher completed; two team members onboarded to the new PMS rate-loading flow." },
];

/** Section H — Social Media Insight (this week vs last week). */
const SOCIAL = [
  { metricKey: "followers", lastWeek: 18420, thisWeek: 18610 },
  { metricKey: "account_reached", lastWeek: 42100, thisWeek: 47850 },
  { metricKey: "impression", lastWeek: 96800, thisWeek: 103400 },
  { metricKey: "profile_visit", lastWeek: 2140, thisWeek: 1980 },
  { metricKey: "website_visit", lastWeek: 1320, thisWeek: 1410 },
];

async function main() {
  const property = await prisma.property.findUnique({ where: { code: "BKDS" } });
  if (!property) {
    console.error("✗ Property BKDS not found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  await prisma.weeklyReport.upsert({
    where: { id: WEEK_ID },
    update: { status: "APPROVED" },
    create: {
      id: WEEK_ID,
      propertyId: property.id,
      startDate: START,
      endDate: END,
      year: 2026,
      weekNumber: 40,
      label: "25 Sep – 1 Oct 2026",
      status: "APPROVED",
    },
  });

  // Clear and re-create child rows
  await Promise.all([
    prisma.weeklyMonthlyStat.deleteMany({ where: { reportWeekId: WEEK_ID } }),
    prisma.weeklyChannelRn.deleteMany({ where: { reportWeekId: WEEK_ID } }),
    prisma.weeklySegmentProduction.deleteMany({ where: { reportWeekId: WEEK_ID } }),
    prisma.weeklyOverviewBlock.deleteMany({ where: { reportWeekId: WEEK_ID } }),
    prisma.weeklySocialMetric.deleteMany({ where: { reportWeekId: WEEK_ID } }),
  ]);

  await prisma.weeklyMonthlyStat.createMany({
    data: MONTHLY.map((m) => ({ ...m, reportWeekId: WEEK_ID })),
  });

  await prisma.weeklyChannelRn.createMany({
    data: CHANNELS.map((c, i) => ({
      reportWeekId: WEEK_ID,
      year: 2026,
      sourceLabel: c.sourceLabel,
      sortOrder: i,
      jan: c.rn[0] ?? 0,
      feb: c.rn[1] ?? 0,
      mar: c.rn[2] ?? 0,
      apr: c.rn[3] ?? 0,
      may: c.rn[4] ?? 0,
      jun: c.rn[5] ?? 0,
      jul: c.rn[6] ?? 0,
      aug: c.rn[7] ?? 0,
      sep: c.rn[8] ?? 0,
      oct: c.rn[9] ?? 0,
      nov: c.rn[10] ?? 0,
      dec: c.rn[11] ?? 0,
    })),
  });

  await prisma.weeklySegmentProduction.createMany({
    data: SEGMENTS.map((s, i) => ({ ...s, sortOrder: i, reportWeekId: WEEK_ID })),
  });

  await prisma.weeklyOverviewBlock.createMany({
    data: OVERVIEW.map((o) => ({ ...o, reportWeekId: WEEK_ID })),
  });

  await prisma.weeklySocialMetric.createMany({
    data: SOCIAL.map((s, i) => ({
      ...s,
      platform: "Instagram",
      sortOrder: i,
      reportWeekId: WEEK_ID,
    })),
  });

  console.log(
    `Seeded demo weekly report BKDS "25 Sep – 1 Oct 2026" (id=${WEEK_ID}): ` +
      `${MONTHLY.length} months, ${CHANNELS.length} channels, ${SEGMENTS.length} segments, ` +
      `${OVERVIEW.length} overview blocks, ${SOCIAL.length} social metrics.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
