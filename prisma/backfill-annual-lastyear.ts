import { PrismaClient } from "@prisma/client";

/**
 * One-time backfill: copy the Section B "Last Year" figures that used to live
 * per-week in WeeklyMonthlyStat (occLy / arrLy / revLy) into the new FIXED
 * annual table (WeeklyLastYear, property + year + month).
 *
 * Run ONCE after deploying the "fixed Last Year" change, before editing any
 * Last Year value in the new Budget & Last Year page, and BEFORE re-saving any
 * Section B grid (a Section B save now writes actuals only and clears the
 * legacy per-week LY columns this backfill reads from).
 *
 *   npx tsx prisma/backfill-annual-lastyear.ts
 *
 * Idempotent and safe to re-run: it only CREATES missing WeeklyLastYear rows
 * and never overwrites an existing one, so a value a human later edits in the
 * grid won't be clobbered.
 *
 * Occupancy: WeeklyMonthlyStat stores a 0–1 fraction; WeeklyLastYear stores a
 * percent (0–100), so the value is multiplied by 100. Where several weeks of a
 * year carried a Last Year value for the same month, the latest week's value
 * wins (per field), which matches "Last Year is fixed for the year".
 */

const prisma = new PrismaClient();

interface MonthLy {
  occPct: number | null;
  arr: number | null;
  revenue: number | null;
}

async function main() {
  const properties = await prisma.property.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } });
  let created = 0;
  let skipped = 0;

  for (const prop of properties) {
    const reports = await prisma.weeklyReport.findMany({
      where: { propertyId: prop.id },
      orderBy: { endDate: "asc" }, // oldest first → later weeks overwrite (latest wins)
      select: {
        year: true,
        monthlyStats: { select: { month: true, occLy: true, arrLy: true, revLy: true } },
      },
    });

    // year → month → merged last-year (latest non-null per field)
    const byYear = new Map<number, Map<number, MonthLy>>();
    for (const r of reports) {
      const ym = byYear.get(r.year) ?? new Map<number, MonthLy>();
      byYear.set(r.year, ym);
      for (const s of r.monthlyStats) {
        const occPct = s.occLy == null ? null : s.occLy.toNumber() * 100;
        const arr = s.arrLy == null ? null : s.arrLy.toNumber();
        const revenue = s.revLy == null ? null : s.revLy.toNumber();
        if (occPct == null && arr == null && revenue == null) continue;
        const prev = ym.get(s.month) ?? { occPct: null, arr: null, revenue: null };
        ym.set(s.month, {
          occPct: occPct ?? prev.occPct,
          arr: arr ?? prev.arr,
          revenue: revenue ?? prev.revenue,
        });
      }
    }

    let propRows = 0;
    for (const [year, ym] of byYear) {
      for (const [month, v] of ym) {
        if (v.occPct == null && v.arr == null && v.revenue == null) continue;
        const existing = await prisma.weeklyLastYear.findUnique({
          where: { propertyId_year_month: { propertyId: prop.id, year, month } },
          select: { id: true },
        });
        if (existing) { skipped++; continue; } // never clobber an existing (possibly edited) value
        await prisma.weeklyLastYear.create({
          data: {
            propertyId: prop.id,
            year,
            month,
            occupancy: v.occPct ?? 0,
            arr: v.arr ?? 0,
            revenue: v.revenue ?? 0,
            rnSold: 0,
          },
        });
        created++;
        propRows++;
      }
    }
    console.log(`${prop.code}: created ${propRows} month last-year row(s) across ${byYear.size} year(s).`);
  }

  console.log(`\nDone. Created ${created} WeeklyLastYear row(s); skipped ${skipped} that already existed.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
