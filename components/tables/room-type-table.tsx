import type { RoomTypeRow } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Room-type production — actuals only (room nights · ADR · revenue · share). */
export function RoomTypeTable({ rows }: { rows: RoomTypeRow[] }) {
  const totalRN = rows.reduce((s, r) => s + r.roomNightsActual, 0);
  const totalRev = rows.reduce((s, r) => s + r.revenueActual, 0);
  const totalAdr = totalRN > 0 ? totalRev / totalRN : 0;

  const renderRow = (label: string, rn: number, adr: number, rev: number, pct: number, isTotal = false) => (
    <tr key={label} className={cn("border-b border-border/60", isTotal && "border-t-2 border-border font-semibold")}>
      <td className="py-2 pr-4 text-foreground">{label}</td>
      <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatNumber(rn)}</td>
      <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatIDR(adr)}</td>
      <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatIDR(rev)}</td>
      <td className="py-2 text-right tabular-nums text-muted-foreground">{formatPercent(pct)}</td>
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Room Type</th>
            <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
            <th className="py-2 pr-4 text-right font-medium">ADR</th>
            <th className="py-2 pr-4 text-right font-medium">Revenue</th>
            <th className="py-2 text-right font-medium">% of Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => renderRow(r.roomTypeName, r.roomNightsActual, r.adrActual, r.revenueActual, r.pctOfRevenue))}
          {renderRow("Total", totalRN, totalAdr, totalRev, 100, true)}
        </tbody>
      </table>
    </div>
  );
}
