/**
 * Post-seed sanity check. Reads the BKDS June 2026 demo period back from the
 * database and prints one derived example (room-revenue achievement vs budget),
 * proving the schema, seed, and calculations line up end to end.
 *
 *   npm run db:verify
 */

import { PrismaClient } from "@prisma/client";

import { achievementPct, variancePct } from "../lib/calculations";
import { BKDS_JUNE_PERIOD_ID } from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  const period = await prisma.reportPeriod.findUnique({
    where: { id: BKDS_JUNE_PERIOD_ID },
    include: {
      property: true,
      revenueSummaries: true,
      _count: {
        select: {
          segmentProduction: true,
          nationality: true,
          accountProduction: true,
          forecasts: true,
        },
      },
    },
  });

  if (!period) {
    console.error(
      `✗ Demo period ${BKDS_JUNE_PERIOD_ID} not found. Did the seed run?`,
    );
    process.exit(1);
  }

  const roomRev = period.revenueSummaries.find(
    (r) => r.department === "ROOM_REVENUE",
  );

  console.log(`Property : ${period.property.code} — ${period.property.name}`);
  console.log(
    `Period   : ${period.period.toISOString().slice(0, 10)} (${period.status})`,
  );
  console.log(
    `Sections : ${period.revenueSummaries.length} revenue lines, ` +
      `${period._count.segmentProduction} segments, ` +
      `${period._count.nationality} nationalities, ` +
      `${period._count.accountProduction} accounts, ` +
      `${period._count.forecasts} forecast months`,
  );

  if (roomRev) {
    const actual = roomRev.actual.toNumber();
    const budget = roomRev.budget.toNumber();
    console.log("\nExample derived metric — Room Revenue vs Budget:");
    console.log(`  Actual : ${actual.toLocaleString("id-ID")}`);
    console.log(`  Budget : ${budget.toLocaleString("id-ID")}`);
    console.log(`  Achievement : ${achievementPct(actual, budget)?.toFixed(2)}%`);
    console.log(`  Variance    : ${variancePct(actual, budget)?.toFixed(2)}%`);
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
