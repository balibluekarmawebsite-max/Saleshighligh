import { achievementPct, variancePct } from "@/lib/calculations";
import {
  formatIDR,
  formatNumber,
  formatPercent,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface VarianceRow {
  label: string;
  actual: number;
  budget: number;
  lastYear?: number | null;
}

/**
 * Generic actual-vs-budget table. Auto-renders Variance % and Achievement %
 * (red/green), an optional Last Year column, and a TOTAL row (summed from the
 * rows unless an explicit `total` is provided).
 */
export function VarianceTable({
  rows,
  firstColumnHeader = "Item",
  valueFormat = "idr",
  showLastYear = false,
  total,
  totalLabel = "Total",
}: {
  rows: VarianceRow[];
  firstColumnHeader?: string;
  valueFormat?: "idr" | "number";
  showLastYear?: boolean;
  total?: VarianceRow | false;
  totalLabel?: string;
}) {
  const fmt = valueFormat === "idr" ? formatIDR : formatNumber;

  const computedTotal: VarianceRow | null =
    total === false
      ? null
      : (total ?? {
          label: totalLabel,
          actual: rows.reduce((s, r) => s + r.actual, 0),
          budget: rows.reduce((s, r) => s + r.budget, 0),
          lastYear: showLastYear
            ? rows.reduce((s, r) => s + (r.lastYear ?? 0), 0)
            : null,
        });

  const renderRow = (row: VarianceRow, isTotal: boolean) => {
    const v = variancePct(row.actual, row.budget);
    const a = achievementPct(row.actual, row.budget);
    return (
      <tr
        key={row.label}
        className={cn(
          "border-b border-border/60",
          isTotal && "border-t-2 border-border font-semibold",
        )}
      >
        <td className="py-2 pr-4 text-foreground">{row.label}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
          {fmt(row.actual)}
        </td>
        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
          {fmt(row.budget)}
        </td>
        {showLastYear && (
          <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
            {row.lastYear === null || row.lastYear === undefined
              ? "—"
              : fmt(row.lastYear)}
          </td>
        )}
        <td className={cn("py-2 pr-4 text-right tabular-nums", varianceColorClass(v))}>
          {formatVariancePercent(v)}
        </td>
        <td className="py-2 text-right tabular-nums text-muted-foreground">
          {a === null ? "—" : formatPercent(a)}
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{firstColumnHeader}</th>
            <th className="py-2 pr-4 text-right font-medium">Actual</th>
            <th className="py-2 pr-4 text-right font-medium">Budget</th>
            {showLastYear && (
              <th className="py-2 pr-4 text-right font-medium">Last Year</th>
            )}
            <th className="py-2 pr-4 text-right font-medium">Var %</th>
            <th className="py-2 text-right font-medium">Ach %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => renderRow(row, false))}
          {computedTotal && renderRow(computedTotal, true)}
        </tbody>
      </table>
    </div>
  );
}
