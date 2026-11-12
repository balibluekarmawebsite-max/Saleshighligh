import type { SourceRow } from "@/lib/dashboard-data";
import { sourceTotals } from "@/lib/sales/restaurant-sources-logic";
import { formatIDR, formatNumber, formatPercent } from "@/lib/format";

const CAT_LABEL: Record<string, string> = {
  IN_HOUSE: "In-House",
  OUTSIDER: "Outsider",
  PLATFORM: "Platforms",
};

/**
 * Source-of-Booking table: one row per source (Persons · % · Average Check ·
 * Revenue) plus a blended TOTAL row, matching the monthly deck layout. The % and
 * average check are derived; only persons + revenue are stored.
 */
export function RestaurantSourcesTable({ sources }: { sources: SourceRow[] }) {
  const totals = sourceTotals(sources);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground">
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-right">Persons</th>
            <th className="px-3 py-2 text-right">%</th>
            <th className="px-3 py-2 text-right">Average Check</th>
            <th className="px-3 py-2 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.sourceName} className="border-b border-border/60">
              <td className="px-3 py-2 font-medium text-foreground">{s.sourceName}</td>
              <td className="px-3 py-2 text-muted-foreground">{CAT_LABEL[s.category] ?? s.category}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatNumber(s.persons)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatPercent(s.pctPersons)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{s.avgCheck !== null ? formatIDR(s.avgCheck) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatIDR(s.revenue)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold text-foreground">
            <td className="px-3 py-2">TOTAL</td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totals.persons)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPercent(100)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{totals.avgCheck !== null ? formatIDR(totals.avgCheck) : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatIDR(totals.revenue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
