import { PrismaClient } from "@prisma/client";

import * as data from "./seed-data";

const prisma = new PrismaClient();

/**
 * Seed the three properties and one fully-populated demo ReportPeriod
 * (BKDS, June 2026). Idempotent: properties are upserted, and the demo
 * period's child rows are cleared and re-created on each run.
 */
async function main() {
  // 1) Properties
  for (const property of data.properties) {
    const { id, ...rest } = property;
    await prisma.property.upsert({
      where: { code: property.code },
      update: rest,
      create: property,
    });
  }
  console.log(`Seeded ${data.properties.length} properties.`);

  // 2) The demo report period (BKDS, June 2026)
  const period = await prisma.reportPeriod.upsert({
    where: { id: data.BKDS_JUNE_PERIOD_ID },
    update: { status: "FINAL" },
    create: {
      id: data.BKDS_JUNE_PERIOD_ID,
      propertyId: data.BKDS_ID,
      period: new Date(data.BKDS_JUNE_PERIOD),
      status: "FINAL",
    },
  });
  const periodId = period.id;

  // 3) Replace all child rows for this period (clear then insert)
  await Promise.all([
    prisma.revenueSummary.deleteMany({ where: { periodId } }),
    prisma.segmentProduction.deleteMany({ where: { periodId } }),
    prisma.roomTypeProduction.deleteMany({ where: { periodId } }),
    prisma.nationalityProduction.deleteMany({ where: { periodId } }),
    prisma.lengthOfStay.deleteMany({ where: { periodId } }),
    prisma.accountProduction.deleteMany({ where: { periodId } }),
    prisma.adsPerformance.deleteMany({ where: { periodId } }),
    prisma.fnbSales.deleteMany({ where: { periodId } }),
    prisma.fnbSourceOfBooking.deleteMany({ where: { periodId } }),
    prisma.fnbAcquisition.deleteMany({ where: { periodId } }),
    prisma.chopeReport.deleteMany({ where: { periodId } }),
    prisma.gokaiReport.deleteMany({ where: { periodId } }),
    prisma.spaSales.deleteMany({ where: { periodId } }),
    prisma.spaTreatment.deleteMany({ where: { periodId } }),
    prisma.platformRanking.deleteMany({ where: { periodId } }),
    prisma.tripadvisorMetrics.deleteMany({ where: { periodId } }),
    prisma.socialMediaMetrics.deleteMany({ where: { periodId } }),
    prisma.bookingPace.deleteMany({ where: { periodId } }),
    prisma.forecast.deleteMany({ where: { periodId } }),
    prisma.narrativeContent.deleteMany({ where: { periodId } }),
    prisma.influencerCollab.deleteMany({ where: { periodId } }),
  ]);

  const withPeriod = <T>(rows: T[]) => rows.map((r) => ({ ...r, periodId }));

  await prisma.revenueSummary.createMany({ data: withPeriod(data.revenueSummaries) });
  await prisma.segmentProduction.createMany({ data: withPeriod(data.segmentProduction) });
  await prisma.roomTypeProduction.createMany({ data: withPeriod(data.roomTypeProduction) });
  await prisma.nationalityProduction.createMany({ data: withPeriod(data.nationalityProduction) });
  await prisma.lengthOfStay.createMany({ data: withPeriod(data.lengthOfStay) });
  await prisma.accountProduction.createMany({ data: withPeriod(data.accountProduction) });
  await prisma.adsPerformance.createMany({ data: withPeriod(data.adsPerformance) });
  await prisma.fnbSales.createMany({ data: withPeriod(data.fnbSales) });
  await prisma.fnbSourceOfBooking.createMany({ data: withPeriod(data.fnbSources) });
  await prisma.fnbAcquisition.createMany({ data: withPeriod(data.fnbAcquisition) });
  await prisma.chopeReport.createMany({ data: withPeriod([data.chopeReport]) });
  await prisma.gokaiReport.createMany({ data: withPeriod(data.gokaiReports) });
  await prisma.spaSales.createMany({ data: withPeriod(data.spaSales) });
  await prisma.spaTreatment.createMany({ data: withPeriod(data.spaTreatments) });
  await prisma.platformRanking.createMany({ data: withPeriod(data.platformRankings) });
  await prisma.tripadvisorMetrics.createMany({ data: withPeriod(data.tripadvisorMetrics) });
  await prisma.socialMediaMetrics.createMany({ data: withPeriod(data.socialMediaMetrics) });
  await prisma.bookingPace.createMany({ data: withPeriod(data.bookingPace) });
  await prisma.forecast.createMany({ data: withPeriod(data.forecasts) });
  await prisma.narrativeContent.createMany({ data: withPeriod(data.narrativeContent) });
  await prisma.influencerCollab.createMany({ data: withPeriod(data.influencerCollabs) });

  console.log(
    `Seeded demo period BKDS ${data.BKDS_JUNE_PERIOD} (id=${periodId}) across all sections.`,
  );

  // 4) Real June 2026 data for BKDU and BKV (executive summary + market segment)
  for (const extra of data.extraPeriods) {
    await prisma.reportPeriod.upsert({
      where: { id: extra.periodId },
      update: { status: "FINAL" },
      create: {
        id: extra.periodId,
        propertyId: extra.propertyId,
        period: new Date(extra.period),
        status: "FINAL",
      },
    });
    await prisma.revenueSummary.deleteMany({ where: { periodId: extra.periodId } });
    await prisma.segmentProduction.deleteMany({ where: { periodId: extra.periodId } });
    await prisma.revenueSummary.createMany({
      data: extra.revenueSummaries.map((r) => ({ ...r, periodId: extra.periodId })),
    });
    await prisma.segmentProduction.createMany({
      data: extra.segmentProduction.map((r) => ({ ...r, periodId: extra.periodId })),
    });
    console.log(
      `Seeded real period ${extra.propertyId} ${extra.period} (executive summary + market segment).`,
    );
  }
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
