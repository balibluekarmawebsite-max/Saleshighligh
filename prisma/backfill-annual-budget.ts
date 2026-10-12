import { PrismaClient } from "@prisma/client";

/**
 * One-time backfill: copy the Section B budget that used to live per-week in
 * WeeklyMonthlyStat (occBudget / arrBudget / revBudget) into the new FIXED
 * annual budget table (WeeklyBudget, property + year + month).
 *
 * Run ONCE after deploying the "year-fixed budget" change, before editing any
 * budget in the new grid. Idempotent and safe to re-run: it only CREATES
 * missing WeeklyBudget rows and never overwrites an existing one, so a budget a
 * human later edits in the grid won't be clobbered.
 *
 *   npx tsx prisma/backfill-annual-budget.ts
 *
 * Occupancy: WeeklyMonthlyStat stores a 0–1 fraction; WeeklyBudget stores a
 * percent (0–100), so the value is multiplied by 100. Where several weeks of a
 * year carried a budget for the same month, the latest week's value wins
 * (per field), which matches "the budget is fixed for the year".
 */

const prisma = new PrismaClient();

interface MonthBudget {
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
        monthlyStats: { select: { month: true, occBudget: true, arrBudget: true, revBudget: true } },
      },
    });

    // year → month → merged budget (latest non-null per field)
    const byYear = new Map<number, Map<number, MonthBudget>>();
    for (const r of reports) {
      const ym = byYear.get(r.year) ?? new Map<number, MonthBudget>();
      byYear.set(r.year, ym);
      for (const s of r.monthlyStats) {
        const occPct = s.occBudget == null ? null : s.occBudget.toNumber() * 100;
        const arr = s.arrBudget == null ? null : s.arrBudget.toNumber();
        const revenue = s.revBudget == null ? null : s.revBudget.toNumber();
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
        const existing = await prisma.weeklyBudget.findUnique({
          where: { propertyId_year_month: { propertyId: prop.id, year, month } },
          select: { id: true },
        });
        if (existing) { skipped++; continue; } // never clobber an existing (possibly edited) budget
        await prisma.weeklyBudget.create({
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
    console.log(`${prop.code}: created ${propRows} month-budget row(s) across ${byYear.size} year(s).`);
  }

  console.log(`\nDone. Created ${created} WeeklyBudget row(s); skipped ${skipped} that already existed.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
