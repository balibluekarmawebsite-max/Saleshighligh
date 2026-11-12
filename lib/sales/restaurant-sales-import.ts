/**
 * Persist Restaurant Sales Performance rows (per-meal covers + revenue, actual &
 * budget) into FnbSales for one (property, period). Find-or-create the period
 * (FINAL locked), upsert one row per meal, audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeMealRows, type RawMealRow } from "@/lib/sales/restaurant-sales-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface MealSalesImportInput {
  property: string;
  period: string; // YYYY-MM
  meals: RawMealRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface MealSalesResult {
  ok: boolean;
  message: string;
  saved?: number;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveMealSales(input: MealSalesImportInput): Promise<MealSalesResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const { rows } = normalizeMealRows(input.meals ?? []);
    if (rows.length === 0) return { ok: false, message: "No valid meal rows (need a meal + covers + revenue)." };

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return { ok: false, message: `unknown property "${code}".` };

    await prisma.$transaction(async (tx) => {
      const period = await tx.reportPeriod.upsert({
        where: { propertyId_period: { propertyId: property.id, period: date } },
        create: { propertyId: property.id, period: date, status: "DRAFT" },
        update: {},
        select: { id: true, status: true },
      });
      if (period.status === "FINAL") throw new FinalLockError();

      for (const r of rows) {
        await tx.fnbSales.upsert({
          where: { periodId_mealPeriod: { periodId: period.id, mealPeriod: r.mealPeriod } },
          create: {
            periodId: period.id,
            mealPeriod: r.mealPeriod,
            coversActual: r.coversActual,
            coversBudget: r.coversBudget,
            revenueActual: r.revenueActual,
            revenueBudget: r.revenueBudget,
          },
          update: {
            coversActual: r.coversActual,
            coversBudget: r.coversBudget,
            revenueActual: r.revenueActual,
            revenueBudget: r.revenueBudget,
          },
        });
      }
    });

    await logAudit("sales_restaurant_sales_save", code, {
      period: input.period,
      meals: rows.map((r) => r.mealPeriod),
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, saved: rows.length, message: `Restaurant sales saved — ${rows.length} meal period(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save restaurant sales." };
  }
}
