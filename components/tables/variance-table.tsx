import { achievementPct, variancePct } from "@/lib/calculations";
import {
  formatIDR,
  formatNumber,
  formatPercent,
  formatRatioPct,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type ValueFormat = "idr" | "number" | "ratio";

export interface VarianceRow {
  label: string;
  actual: number;
  budget: number;
  lastYear?: number | null;
  /** Overrides the table-level format for this row (e.g. occupancy = "ratio"). */
  format?: ValueFormat;
}

function fmtValue(v: number | null | undefined, format: ValueFormat): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (format === "idr") return formatIDR(v);
  if (format === "number") return formatNumber(v);
  return formatRatioPct(v); // ratio (0–1) → "94.83%"
}

/**
 * Generic actual-vs-budget table. Auto-renders Variance and Achievement %
 * (red/green), an optional Last Year column, and a TOTAL row (summed unless an
 * explicit `total` is given or `total={false}`). Per-row `format` allows mixed
 * units; "ratio" rows show the variance as percentage points.
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
  valueFormat?: ValueFormat;
  showLastYear?: boolean;
  total?: VarianceRow | false;
  totalLabel?: string;
}) {
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
    const format = row.format ?? valueFormat;
    const isRatio = format === "ratio";
    const varianceNode = isRatio
      ? (() => {
          const pts = (row.actual - row.budget) * 100;
          return (
            <span className={varianceColorClass(pts)}>
              {`${pts > 0 ? "+" : ""}${pts.toFixed(2)} pts`}
            </span>
          );
        })()
      : (() => {
          const v = variancePct(row.actual, row.budget);
          return (
            <span className={varianceColorClass(v)}>
              {formatVariancePercent(v)}
            </span>
          );
        })();
    const ach = achievementPct(row.actual, row.budget);

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
          {fmtValue(row.actual, format)}
        </td>
        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
          {fmtValue(row.budget, format)}
        </td>
        {showLastYear && (
          <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
            {fmtValue(row.lastYear, format)}
          </td>
        )}
        <td className="py-2 pr-4 text-right tabular-nums">{varianceNode}</td>
        <td className="py-2 text-right tabular-nums text-muted-foreground">
          {ach === null ? "—" : formatPercent(ach)}
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
            <th className="py-2 pr-4 text-right font-medium">Variance</th>
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
