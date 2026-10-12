/**
 * Annual budget for Section B (YTD Actual & Forecast).
 *
 * The budget is a FIXED yearly plan — entered once per property + year and the
 * same across every weekly report. It lives in `WeeklyBudget`
 * (propertyId + year + month), NOT in the per-week `WeeklyMonthlyStat` (which
 * holds the Actuals that sync from the PMS and the manually-entered Last Year
 * figures). So creating a new weekly report never resets the budget, and a PMS
 * actuals push never overwrites it.
 *
 * Units: `WeeklyBudget.occupancy` is stored as a PERCENT (0–100) per the schema.
 * This module exposes occupancy as a 0–1 FRACTION (`occFraction`) to match the
 * `WeeklyMonthlyStat` convention, so the dashboard / export / editor consumers
 * read it in the same units they already used for the old per-week budget.
 *
 * A stored 0 means "unset" (a real hotel budget is never exactly 0% / Rp 0), so
 * zeros read back as null and show blank rather than a misleading 0.
 */

import { prisma } from "@/lib/prisma";

export interface AnnualBudgetMonth {
  /** Occupancy as a 0–1 fraction (null when unset). */
  occFraction: number | null;
  /** Average room rate (IDR), null when unset. */
  arr: number | null;
  /** Revenue (IDR), null when unset. */
  revenue: number | null;
  /** Budgeted room nights, null when unset. */
  rnSold: number | null;
}

/** Input for one month of the annual budget (occupancy as a 0–1 fraction). */
export interface AnnualBudgetInput {
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

/** Occupancy percent (0–100, as stored) → 0–1 fraction, at the stored precision. */
export const occPctToFraction = (pct: number): number => Math.round((pct / 100) * 10000) / 10000;
/** Occupancy 0–1 fraction → percent (0–100) for storage (3 dp, matches the column). */
export const occFractionToPct = (frac: number): number => Math.round(frac * 100 * 1000) / 1000;

/** Read the fixed annual budget for a property + year, keyed by month (1–12). */
export async function getAnnualBudget(
  propertyId: string,
  year: number,
): Promise<Map<number, AnnualBudgetMonth>> {
  const rows = await prisma.weeklyBudget.findMany({
    where: { propertyId, year },
    select: { month: true, occupancy: true, arr: true, revenue: true, rnSold: true },
  });
  const map = new Map<number, AnnualBudgetMonth>();
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
 * Replace the annual budget for a property + year. Months with at least one
 * value are upserted; months whose values are all empty are removed, so a
 * cleared month shows blank rather than lingering as zeros. Occupancy is taken
 * as a 0–1 fraction and stored as a percent.
 */
export async function saveAnnualBudget(
  propertyId: string,
  year: number,
  items: AnnualBudgetInput[],
): Promise<void> {
  const byMonth = new Map<number, AnnualBudgetInput>();
  for (const it of items) {
    if (!Number.isInteger(it.month) || it.month < 1 || it.month > 12) continue;
    byMonth.set(it.month, it);
  }

  await prisma.$transaction(async (tx) => {
    for (let month = 1; month <= 12; month++) {
      const it = byMonth.get(month);
      const occPct = it?.occFraction == null ? null : occFractionToPct(it.occFraction);
      const arr = it?.arr ?? null;
      const revenue = it?.revenue ?? null;
      const rnSold = it?.rnSold ?? null;
      const hasAny = occPct != null || arr != null || revenue != null || rnSold != null;

      if (!hasAny) {
        await tx.weeklyBudget.deleteMany({ where: { propertyId, year, month } });
        continue;
      }
      await tx.weeklyBudget.upsert({
        where: { propertyId_year_month: { propertyId, year, month } },
        update: { occupancy: occPct ?? 0, arr: arr ?? 0, revenue: revenue ?? 0, rnSold: rnSold ?? 0 },
        create: { propertyId, year, month, occupancy: occPct ?? 0, arr: arr ?? 0, revenue: revenue ?? 0, rnSold: rnSold ?? 0 },
      });
    }
  });
}
