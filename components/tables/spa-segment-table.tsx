import { Fragment } from "react";

import { avgCheck, variancePct } from "@/lib/calculations";
import type { SpaSegmentRow } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatVariancePercent, varianceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEG_LABEL: Record<string, string> = {
  IN_HOUSE: "In-House",
  OUTSIDE: "Outside",
  INCLUSION: "Inclusion",
};

/** Signed absolute diff, formatted with an explicit + for gains. */
function signed(value: number, fmt: (v: number) => string): string {
  return `${value > 0 ? "+" : ""}${fmt(value)}`;
}

/** A column group: "Actual | Budget | (Diff) | %" vs budget. */
function Group({
  actual,
  budget,
  fmt,
  showDiff = false,
}: {
  actual: number | null;
  budget: number | null;
  fmt: (v: number) => string;
  showDiff?: boolean;
}) {
  const diff = actual !== null && budget !== null ? actual - budget : null;
  const pct = actual !== null && budget !== null ? variancePct(actual, budget) : null;
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">{actual !== null ? fmt(actual) : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{budget !== null ? fmt(budget) : "—"}</td>
      {showDiff && (
        <td className={cn("px-3 py-2 text-right tabular-nums", varianceColorClass(diff))}>
          {diff !== null ? signed(diff, fmt) : "—"}
        </td>
      )}
      <td className={cn("px-3 py-2 text-right tabular-nums", varianceColorClass(pct))}>
        {formatVariancePercent(pct)}
      </td>
    </>
  );
}

/**
 * Spa guest-segment performance: Covers and Average Check as Actual / Budget /
 * % vs budget, Revenue as Actual / Budget / Diff / %, with a blended TOTAL row.
 */
export function SpaSegmentTable({ segments }: { segments: SpaSegmentRow[] }) {
  const coversActual = segments.reduce((s, r) => s + r.coversActual, 0);
  const coversBudget = segments.reduce((s, r) => s + r.coversBudget, 0);
  const revActual = segments.reduce((s, r) => s + r.revenueActual, 0);
  const revBudget = segments.reduce((s, r) => s + r.revenueBudget, 0);

  const groupHead = "px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-foreground";
  const subHead = "px-3 py-2 text-right text-xs font-medium text-muted-foreground";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th rowSpan={2} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Segment</th>
            <th colSpan={3} className={cn(groupHead, "border-l border-border")}>Covers</th>
            <th colSpan={3} className={cn(groupHead, "border-l border-border")}>Average Check</th>
            <th colSpan={4} className={cn(groupHead, "border-l border-border")}>Revenue</th>
          </tr>
          <tr className="border-b border-border">
            <th className={cn(subHead, "border-l border-border")}>Actual</th>
            <th className={subHead}>Budget</th>
            <th className={subHead}>%</th>
            <th className={cn(subHead, "border-l border-border")}>Actual</th>
            <th className={subHead}>Budget</th>
            <th className={subHead}>%</th>
            <th className={cn(subHead, "border-l border-border")}>Actual</th>
            <th className={subHead}>Budget</th>
            <th className={subHead}>Diff</th>
            <th className={subHead}>%</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={s.segment} className="border-b border-border/60">
              <td className="px-3 py-2 font-medium text-foreground">{SEG_LABEL[s.segment] ?? s.segment}</td>
              <Group actual={s.coversActual} budget={s.coversBudget} fmt={formatNumber} />
              <Group actual={s.avgCheckActual} budget={s.avgCheckBudget} fmt={formatIDR} />
              <Group actual={s.revenueActual} budget={s.revenueBudget} fmt={formatIDR} showDiff />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-3 py-2 text-foreground">Total</td>
            <Group actual={coversActual} budget={coversBudget} fmt={formatNumber} />
            <Group actual={avgCheck(revActual, coversActual)} budget={avgCheck(revBudget, coversBudget)} fmt={formatIDR} />
            <Group actual={revActual} budget={revBudget} fmt={formatIDR} showDiff />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
