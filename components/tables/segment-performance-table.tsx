import { achievementPct, variancePct } from "@/lib/calculations";
import type { SegmentRowFull, SeriesTriple } from "@/lib/dashboard-data";
import {
  formatIDR,
  formatNumber,
  formatPercent,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function TripleCells({ t }: { t: SeriesTriple | null }) {
  return (
    <>
      <td className="py-2 pr-3 text-right tabular-nums text-foreground">
        {t ? formatNumber(t.rn) : "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {t ? formatIDR(t.arr) : "—"}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums text-foreground">
        {t ? formatIDR(t.revenue) : "—"}
      </td>
    </>
  );
}

/**
 * Market-segment performance with grouped columns: This Year / Budget / Last
 * Year (each RN · ARR · Revenue), plus revenue variance vs budget and
 * achievement %, with a blended-ARR TOTAL row.
 */
export function SegmentPerformanceTable({
  segments,
  totals,
}: {
  segments: SegmentRowFull[];
  totals: { actual: SeriesTriple; budget: SeriesTriple; lastYear: SeriesTriple | null };
}) {
  const row = (
    name: string,
    actual: SeriesTriple,
    budget: SeriesTriple,
    lastYear: SeriesTriple | null,
    isTotal = false,
  ) => {
    const v = variancePct(actual.revenue, budget.revenue);
    const ach = achievementPct(actual.revenue, budget.revenue);
    return (
      <tr key={name} className={cn("border-b border-border/60", isTotal && "border-t-2 border-border font-semibold")}>
        <td className="py-2 pr-4 text-foreground">{name}</td>
        <TripleCells t={actual} />
        <TripleCells t={budget} />
        <TripleCells t={lastYear} />
        <td className={cn("py-2 pr-4 text-right tabular-nums", varianceColorClass(v))}>
          {formatVariancePercent(v)}
        </td>
        <td className="py-2 text-right tabular-nums text-muted-foreground">
          {ach === null ? "—" : formatPercent(ach)}
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-4" rowSpan={2}>Segment</th>
            <th className="border-b border-border py-1 pr-3 text-center font-medium" colSpan={3}>This Year</th>
            <th className="border-b border-border py-1 pr-3 text-center font-medium" colSpan={3}>Budget</th>
            <th className="border-b border-border py-1 pr-3 text-center font-medium" colSpan={3}>Last Year</th>
            <th className="py-1 pr-4 text-right" rowSpan={2}>Rev Var %</th>
            <th className="py-1 text-right" rowSpan={2}>Ach %</th>
          </tr>
          <tr className="border-b border-border text-right text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-3 font-medium">RN</th>
            <th className="py-1 pr-3 font-medium">ARR</th>
            <th className="py-1 pr-4 font-medium">Revenue</th>
            <th className="py-1 pr-3 font-medium">RN</th>
            <th className="py-1 pr-3 font-medium">ARR</th>
            <th className="py-1 pr-4 font-medium">Revenue</th>
            <th className="py-1 pr-3 font-medium">RN</th>
            <th className="py-1 pr-3 font-medium">ARR</th>
            <th className="py-1 pr-4 font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => row(s.name, s.actual, s.budget, s.lastYear))}
          {row("Total", totals.actual, totals.budget, totals.lastYear, true)}
        </tbody>
      </table>
    </div>
  );
}
