import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { ParsedDomain, ParseResult } from "./parse";

export interface ApplyResult {
  periodId: string;
  written: Record<string, number>;
}

export class ImportLockedError extends Error {}

/** Build the delete filter for a tab: periodId plus any fixed values (scope). */
function whereFor(periodId: string, domain: ParsedDomain): Record<string, unknown> {
  return { periodId, ...(domain.fixed ?? {}) };
}

/**
 * Replace one tab's data within a transaction: wipe the matching rows for this
 * period (scoped by MTD/YTD where applicable), then insert the parsed rows.
 */
async function writeDomain(
  tx: Prisma.TransactionClient,
  domain: ParsedDomain,
  periodId: string,
): Promise<void> {
  const where = whereFor(periodId, domain);
  const rows = domain.rows.map((r) => ({ ...r, periodId }));
  const hasRows = rows.length > 0;

  switch (domain.model) {
    case "revenueSummary":
      await tx.revenueSummary.deleteMany({ where: where as Prisma.RevenueSummaryWhereInput });
      if (hasRows) await tx.revenueSummary.createMany({ data: rows as unknown as Prisma.RevenueSummaryCreateManyInput[] });
      break;
    case "segmentProduction":
      await tx.segmentProduction.deleteMany({ where: where as Prisma.SegmentProductionWhereInput });
      if (hasRows) await tx.segmentProduction.createMany({ data: rows as unknown as Prisma.SegmentProductionCreateManyInput[] });
      break;
    case "roomTypeProduction":
      await tx.roomTypeProduction.deleteMany({ where: where as Prisma.RoomTypeProductionWhereInput });
      if (hasRows) await tx.roomTypeProduction.createMany({ data: rows as unknown as Prisma.RoomTypeProductionCreateManyInput[] });
      break;
    case "nationalityProduction":
      await tx.nationalityProduction.deleteMany({ where: where as Prisma.NationalityProductionWhereInput });
      if (hasRows) await tx.nationalityProduction.createMany({ data: rows as unknown as Prisma.NationalityProductionCreateManyInput[] });
      break;
    case "lengthOfStay":
      await tx.lengthOfStay.deleteMany({ where: where as Prisma.LengthOfStayWhereInput });
      if (hasRows) await tx.lengthOfStay.createMany({ data: rows as unknown as Prisma.LengthOfStayCreateManyInput[] });
      break;
    case "accountProduction":
      await tx.accountProduction.deleteMany({ where: where as Prisma.AccountProductionWhereInput });
      if (hasRows) await tx.accountProduction.createMany({ data: rows as unknown as Prisma.AccountProductionCreateManyInput[] });
      break;
    case "adsPerformance":
      await tx.adsPerformance.deleteMany({ where: where as Prisma.AdsPerformanceWhereInput });
      if (hasRows) await tx.adsPerformance.createMany({ data: rows as unknown as Prisma.AdsPerformanceCreateManyInput[] });
      break;
    case "fnbSales":
      await tx.fnbSales.deleteMany({ where: where as Prisma.FnbSalesWhereInput });
      if (hasRows) await tx.fnbSales.createMany({ data: rows as unknown as Prisma.FnbSalesCreateManyInput[] });
      break;
    case "fnbSourceOfBooking":
      await tx.fnbSourceOfBooking.deleteMany({ where: where as Prisma.FnbSourceOfBookingWhereInput });
      if (hasRows) await tx.fnbSourceOfBooking.createMany({ data: rows as unknown as Prisma.FnbSourceOfBookingCreateManyInput[] });
      break;
    case "fnbAcquisition":
      await tx.fnbAcquisition.deleteMany({ where: where as Prisma.FnbAcquisitionWhereInput });
      if (hasRows) await tx.fnbAcquisition.createMany({ data: rows as unknown as Prisma.FnbAcquisitionCreateManyInput[] });
      break;
    case "chopeReport":
      await tx.chopeReport.deleteMany({ where: where as Prisma.ChopeReportWhereInput });
      if (hasRows) await tx.chopeReport.createMany({ data: rows as unknown as Prisma.ChopeReportCreateManyInput[] });
      break;
    case "gokaiReport":
      await tx.gokaiReport.deleteMany({ where: where as Prisma.GokaiReportWhereInput });
      if (hasRows) await tx.gokaiReport.createMany({ data: rows as unknown as Prisma.GokaiReportCreateManyInput[] });
      break;
    case "spaSales":
      await tx.spaSales.deleteMany({ where: where as Prisma.SpaSalesWhereInput });
      if (hasRows) await tx.spaSales.createMany({ data: rows as unknown as Prisma.SpaSalesCreateManyInput[] });
      break;
    case "spaTreatment":
      await tx.spaTreatment.deleteMany({ where: where as Prisma.SpaTreatmentWhereInput });
      if (hasRows) await tx.spaTreatment.createMany({ data: rows as unknown as Prisma.SpaTreatmentCreateManyInput[] });
      break;
    case "platformRanking":
      await tx.platformRanking.deleteMany({ where: where as Prisma.PlatformRankingWhereInput });
      if (hasRows) await tx.platformRanking.createMany({ data: rows as unknown as Prisma.PlatformRankingCreateManyInput[] });
      break;
    case "socialMediaMetrics":
      await tx.socialMediaMetrics.deleteMany({ where: where as Prisma.SocialMediaMetricsWhereInput });
      if (hasRows) await tx.socialMediaMetrics.createMany({ data: rows as unknown as Prisma.SocialMediaMetricsCreateManyInput[] });
      break;
    case "bookingPace":
      await tx.bookingPace.deleteMany({ where: where as Prisma.BookingPaceWhereInput });
      if (hasRows) await tx.bookingPace.createMany({ data: rows as unknown as Prisma.BookingPaceCreateManyInput[] });
      break;
    case "forecast":
      await tx.forecast.deleteMany({ where: where as Prisma.ForecastWhereInput });
      if (hasRows) await tx.forecast.createMany({ data: rows as unknown as Prisma.ForecastCreateManyInput[] });
      break;
    case "influencerCollab":
      await tx.influencerCollab.deleteMany({ where: where as Prisma.InfluencerCollabWhereInput });
      if (hasRows) await tx.influencerCollab.createMany({ data: rows as unknown as Prisma.InfluencerCollabCreateManyInput[] });
      break;
    default:
      throw new Error(`No DB writer for model "${domain.model}"`);
  }
}

/**
 * Persist a parsed workbook. Creates the ReportPeriod if needed, replaces each
 * present tab's data in a single transaction, and logs an ImportHistory record.
 * Refuses to write when the period is FINAL.
 */
export async function applyImport(
  parsed: ParseResult,
  opts: {
    propertyCode: string;
    period: string; // YYYY-MM
    fileName: string;
    uploadedBy?: string | null;
  },
): Promise<ApplyResult> {
  const property = await prisma.property.findUnique({
    where: { code: opts.propertyCode },
  });
  if (!property) throw new Error(`Unknown property "${opts.propertyCode}"`);

  const periodDate = new Date(`${opts.period}-01T00:00:00.000Z`);

  const existing = await prisma.reportPeriod.findUnique({
    where: { propertyId_period: { propertyId: property.id, period: periodDate } },
  });
  if (existing?.status === "FINAL") {
    throw new ImportLockedError(
      "This report period is marked FINAL and is locked for editing.",
    );
  }

  const written: Record<string, number> = {};

  const periodId = await prisma.$transaction(async (tx) => {
    const period =
      existing ??
      (await tx.reportPeriod.create({
        data: { propertyId: property.id, period: periodDate, status: "DRAFT" },
      }));

    for (const domain of parsed.domains) {
      await writeDomain(tx, domain, period.id);
      written[domain.tab] = domain.rows.length;
    }

    await tx.importHistory.create({
      data: {
        propertyId: property.id,
        period: periodDate,
        fileName: opts.fileName,
        uploadedBy: opts.uploadedBy ?? null,
        rowCounts: written as Prisma.InputJsonObject,
      },
    });

    return period.id;
  });

  return { periodId, written };
}
