/**
 * Annual "Last Year" baseline for Section B (YTD Actual & Forecast).
 *
 * Like the budget, the Last Year comparison is a FIXED yearly reference —
 * entered once per property + year and the same across every weekly report. It
 * lives in `WeeklyLastYear` (propertyId + year + month), NOT in the per-week
 * `WeeklyMonthlyStat`. So creating a new weekly report never resets it, and a
 * PMS actuals push never overwrites it.
 *
 * This mirrors `lib/weekly/annual-budget.ts` exactly (same columns, same units)
 * and reuses its occupancy converters — `WeeklyLastYear.occupancy` is a PERCENT
 * (0–100) in the DB, exposed here as a 0–1 FRACTION so every consumer reads it
 * in the same units it already used for the old per-week Last Year figures.
 *
 * A stored 0 means "unset" (prior-year actuals are never exactly 0% / Rp 0), so
 * zeros read back as null and show blank rather than a misleading 0.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { occFractionToPct, occPctToFraction } from "@/lib/weekly/annual-budget";

export interface AnnualLastYearMonth {
  /** Occupancy as a 0–1 fraction (null when unset). */
  occFraction: number | null;
  /** Average room rate (IDR), null when unset. */
  arr: number | null;
  /** Revenue (IDR), null when unset. */
  revenue: number | null;
  /** Room nights, null when unset. */
  rnSold: number | null;
}

/** Input for one month of the annual Last Year baseline (occupancy as a 0–1 fraction). */
export interface AnnualLastYearInput {
  month: number;
  occFraction?: number | null;
  arr?: number | null;
  revenue?: number | null;
  rnSold?: number | null;
}

const numOrNull = (d: { toNumber(): number } | number | null | undefined): number | null => {
  if (d == null) return null;
  const n = typeof d === "number" ? d : d.toNumber();
  return Number.isFinite(n) && n !== 0 ? n : null; // 0 ⇒ unset
};

/** Read the fixed Last Year baseline for a property + year, keyed by month (1–12). */
export async function getAnnualLastYear(
  propertyId: string,
  year: number,
): Promise<Map<number, AnnualLastYearMonth>> {
  const rows = await prisma.weeklyLastYear.findMany({
    where: { propertyId, year },
    select: { month: true, occupancy: true, arr: true, revenue: true, rnSold: true },
  });
  const map = new Map<number, AnnualLastYearMonth>();
  for (const r of rows) {
    const occPct = numOrNull(r.occupancy);
    map.set(r.month, {
      occFraction: occPct == null ? null : occPctToFraction(occPct),
      arr: numOrNull(r.arr),
      revenue: numOrNull(r.revenue),
      rnSold: numOrNull(r.rnSold),
    });
  }
  return map;
}

/**
 * Replace the Last Year baseline for a property + year. Months with at least
 * one value are upserted; months whose values are all empty are removed, so a
 * cleared month shows blank rather than lingering as zeros. Occupancy is taken
 * as a 0–1 fraction and stored as a percent.
 */
export async function saveAnnualLastYear(
  propertyId: string,
  year: number,
  items: AnnualLastYearInput[],
  /** Run inside an existing transaction (e.g. to write Budget + Last Year atomically). */
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const byMonth = new Map<number, AnnualLastYearInput>();
  for (const it of items) {
    if (!Number.isInteger(it.month) || it.month < 1 || it.month > 12) continue;
    byMonth.set(it.month, it);
  }

  const run = async (client: Prisma.TransactionClient) => {
    for (let month = 1; month <= 12; month++) {
      const it = byMonth.get(month);
      const occPct = it?.occFraction == null ? null : occFractionToPct(it.occFraction);
      const arr = it?.arr ?? null;
      const revenue = it?.revenue ?? null;
      const rnSold = it?.rnSold ?? null;
      const hasAny = occPct != null || arr != null || revenue != null || rnSold != null;

      if (!hasAny) {
        await client.weeklyLastYear.deleteMany({ where: { propertyId, year, month } });
        continue;
      }
      await client.weeklyLastYear.upsert({
        where: { propertyId_year_month: { propertyId, year, month } },
        update: { occupancy: occPct ?? 0, arr: arr ?? 0, revenue: revenue ?? 0, rnSold: rnSold ?? 0 },
        create: { propertyId, year, month, occupancy: occPct ?? 0, arr: arr ?? 0, revenue: revenue ?? 0, rnSold: rnSold ?? 0 },
      });
    }
  };

  if (tx) await run(tx);
  else await prisma.$transaction(run);
}
