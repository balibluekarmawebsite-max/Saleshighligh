import { Fragment } from "react";

import { avgCheck, variancePct } from "@/lib/calculations";
import type { MealRow } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatVariancePercent, varianceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

const MEAL_LABEL: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

/** Signed absolute diff, formatted with an explicit + for gains. */
function signed(value: number, fmt: (v: number) => string): string {
  return `${value > 0 ? "+" : ""}${fmt(value)}`;
}

/** One "Actual | Budget | Diff | %" column group. */
function Group({
  actual,
  budget,
  fmt,
}: {
  actual: number | null;
  budget: number | null;
  fmt: (v: number) => string;
}) {
  const diff = actual !== null && budget !== null ? actual - budget : null;
  const pct = actual !== null && budget !== null ? variancePct(actual, budget) : null;
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">{actual !== null ? fmt(actual) : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{budget !== null ? fmt(budget) : "—"}</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", varianceColorClass(diff))}>
        {diff !== null ? signed(diff, fmt) : "—"}
      </td>
      <td className={cn("px-3 py-2 text-right tabular-nums", varianceColorClass(pct))}>
        {formatVariancePercent(pct)}
      </td>
    </>
  );
}

/**
 * Meal-period performance: Covers, Average Check and Revenue each shown as
 * Actual / Budget / Diff / % vs budget, plus each meal's share of restaurant
 * revenue, with a blended TOTAL row.
 */
export function MealPeriodTable({ meals }: { meals: MealRow[] }) {
  const totalCoversActual = meals.reduce((s, m) => s + m.coversActual, 0);
  const totalCoversBudget = meals.reduce((s, m) => s + m.coversBudget, 0);
  const totalRevActual = meals.reduce((s, m) => s + m.revenueActual, 0);
  const totalRevBudget = meals.reduce((s, m) => s + m.revenueBudget, 0);

  const groupHead = "px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-foreground";
  const subHead = "px-3 py-2 text-right text-xs font-medium text-muted-foreground";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Meal</th>
            <th colSpan={4} className={cn(groupHead, "border-l border-border")}>Covers</th>
            <th colSpan={4} className={cn(groupHead, "border-l border-border")}>Average Check</th>
            <th colSpan={4} className={cn(groupHead, "border-l border-border")}>Revenue</th>
            <th rowSpan={2} className="border-l border-border px-3 py-2 text-right text-xs font-medium text-muted-foreground">% of Rev</th>
          </tr>
          <tr className="border-b border-border">
            {[0, 1, 2].map((g) => (
              <Fragment key={g}>
                <th className={cn(subHead, "border-l border-border")}>Actual</th>
                <th className={subHead}>Budget</th>
                <th className={subHead}>Diff</th>
                <th className={subHead}>%</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {meals.map((m) => (
            <tr key={m.meal} className="border-b border-border/60">
              <td className="px-3 py-2 font-medium text-foreground">{MEAL_LABEL[m.meal] ?? m.meal}</td>
              <Group actual={m.coversActual} budget={m.coversBudget} fmt={formatNumber} />
              <Group actual={m.avgCheckActual} budget={m.avgCheckBudget} fmt={formatIDR} />
              <Group actual={m.revenueActual} budget={m.revenueBudget} fmt={formatIDR} />
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.pctOfRevenue.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-3 py-2 text-foreground">Total</td>
            <Group actual={totalCoversActual} budget={totalCoversBudget} fmt={formatNumber} />
            <Group
              actual={avgCheck(totalRevActual, totalCoversActual)}
              budget={avgCheck(totalRevBudget, totalCoversBudget)}
              fmt={formatIDR}
            />
            <Group actual={totalRevActual} budget={totalRevBudget} fmt={formatIDR} />
            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">100.0%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
