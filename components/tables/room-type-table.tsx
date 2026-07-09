import { achievementPct, variancePct } from "@/lib/calculations";
import type { RoomTypeRow } from "@/lib/dashboard-data";
import {
  formatIDR,
  formatNumber,
  formatPercent,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function RoomTypeTable({ rows }: { rows: RoomTypeRow[] }) {
  const total = {
    rnA: rows.reduce((s, r) => s + r.roomNightsActual, 0),
    rnB: rows.reduce((s, r) => s + r.roomNightsBudget, 0),
    revA: rows.reduce((s, r) => s + r.revenueActual, 0),
    revB: rows.reduce((s, r) => s + r.revenueBudget, 0),
  };
  const totalAdrA = total.rnA > 0 ? total.revA / total.rnA : 0;
  const totalAdrB = total.rnB > 0 ? total.revB / total.rnB : 0;

  const renderRow = (
    label: string,
    rnA: number,
    rnB: number,
    adrA: number,
    adrB: number,
    revA: number,
    revB: number,
    isTotal = false,
  ) => {
    const v = variancePct(revA, revB);
    const ach = achievementPct(revA, revB);
    return (
      <tr key={label} className={cn("border-b border-border/60", isTotal && "border-t-2 border-border font-semibold")}>
        <td className="py-2 pr-4 text-foreground">{label}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatNumber(rnA)}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{formatNumber(rnB)}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatIDR(adrA)}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{formatIDR(adrB)}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatIDR(revA)}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{formatIDR(revB)}</td>
        <td className={cn("py-2 pr-4 text-right tabular-nums", varianceColorClass(v))}>{formatVariancePercent(v)}</td>
        <td className="py-2 text-right tabular-nums text-muted-foreground">{ach === null ? "—" : formatPercent(ach)}</td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Room Type</th>
            <th className="py-2 pr-4 text-right font-medium">RN Actual</th>
            <th className="py-2 pr-4 text-right font-medium">RN Budget</th>
            <th className="py-2 pr-4 text-right font-medium">ADR Actual</th>
            <th className="py-2 pr-4 text-right font-medium">ADR Budget</th>
            <th className="py-2 pr-4 text-right font-medium">Rev Actual</th>
            <th className="py-2 pr-4 text-right font-medium">Rev Budget</th>
            <th className="py-2 pr-4 text-right font-medium">Rev Var %</th>
            <th className="py-2 text-right font-medium">Ach %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            renderRow(r.roomTypeName, r.roomNightsActual, r.roomNightsBudget, r.adrActual, r.adrBudget, r.revenueActual, r.revenueBudget),
          )}
          {renderRow("Total", total.rnA, total.rnB, totalAdrA, totalAdrB, total.revA, total.revB, true)}
        </tbody>
      </table>
    </div>
  );
}
