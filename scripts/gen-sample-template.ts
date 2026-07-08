/**
 * Generates the seed-compatible sample workbook (BKDS, June 2026) into /samples,
 * filled from prisma/seed-data.ts. Run offline:
 *   npx tsx scripts/gen-sample-template.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as data from "../prisma/seed-data";
import { generateFilledBuffer } from "../lib/import/template";

const dataByTab: Record<string, Record<string, unknown>[]> = {
  SUMMARY: data.revenueSummaries,
  SEGMENT_MTD: data.segmentProduction,
  SEGMENT_YTD: [],
  ROOMTYPE: data.roomTypeProduction,
  NATIONALITY_MTD: data.nationalityProduction,
  NATIONALITY_YTD: [],
  LOS: data.lengthOfStay,
  ACCOUNTS: data.accountProduction,
  ADS: data.adsPerformance,
  FNB_SALES: data.fnbSales,
  FNB_SOB: data.fnbSources,
  FNB_ACQUISITION: data.fnbAcquisition,
  CHOPE: [data.chopeReport],
  GOKAI: data.gokaiReports,
  SPA_SALES: data.spaSales,
  SPA_TREATMENTS: data.spaTreatments,
  REPUTATION: data.platformRankings,
  SOCIAL: data.socialMediaMetrics,
  PACE: data.bookingPace,
  FORECAST: data.forecasts,
  INFLUENCERS: data.influencerCollabs,
};

const buffer = generateFilledBuffer({
  propertyCode: "BKDS",
  period: "2026-06",
  dataByTab,
});

const dir = join(__dirname, "..", "samples");
mkdirSync(dir, { recursive: true });
const target = join(dir, "BK_SalesData_BKDS_2026-06.xlsx");
writeFileSync(target, buffer);
console.log(`Wrote ${target} (${buffer.length} bytes)`);
