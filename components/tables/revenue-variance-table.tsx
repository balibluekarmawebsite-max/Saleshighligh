import { variancePct } from "@/lib/calculations";
import {
  formatIDR,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RevenueVarianceRow {
  label: string;
  actual: number;
  budget: number;
}

/**
 * Accessible table companion for the Actual-vs-Budget charts: Actual, Budget,
 * and signed variance % (green positive / red negative).
 */
export function RevenueVarianceTable({
  rows,
  firstColumnHeader = "Department",
  emphasizeLast = false,
}: {
  rows: RevenueVarianceRow[];
  firstColumnHeader?: string;
  emphasizeLast?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{firstColumnHeader}</th>
            <th className="py-2 pr-4 text-right font-medium">Actual</th>
            <th className="py-2 pr-4 text-right font-medium">Budget</th>
            <th className="py-2 text-right font-medium">Var %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const v = variancePct(row.actual, row.budget);
            const isLast = emphasizeLast && i === rows.length - 1;
            return (
              <tr
                key={row.label}
                className={cn(
                  "border-b border-border/60",
                  isLast && "font-semibold",
                )}
              >
                <td className="py-2 pr-4 text-foreground">{row.label}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                  {formatIDR(row.actual)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                  {formatIDR(row.budget)}
                </td>
                <td
                  className={cn(
                    "py-2 text-right tabular-nums",
                    varianceColorClass(v),
                  )}
                >
                  {formatVariancePercent(v)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
