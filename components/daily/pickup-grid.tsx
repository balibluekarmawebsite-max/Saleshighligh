import { EmptyState } from "@/components/dashboard/empty-state";
import { type PickupColumnSummary, type PickupReport } from "@/lib/daily/pickup-report-data";
import { formatIDR, formatNumber, formatPct, formatVariancePercent, varianceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

const pctCell = (v: number | null): string => (v == null ? "—" : formatPct(v));

/**
 * The Daily Reservation Report's Occupancy Pick-Up grid: rows = snapshot dates,
 * columns = stay months, cells = occupancy on hand. The footer carries the
 * summary rows (Average Pickup/day, Increasement %, Occ on Hand, Room Sold, ADR,
 * Revenue Nett) computed from the latest reading per column.
 */
export function PickupGrid({ report }: { report: PickupReport }) {
  const { columns, rows, summaries } = report;

  if (columns.length === 0 || rows.length === 0) {
    return (
      <EmptyState
        title="No pick-up data yet"
        message="No occupancy snapshots were recorded this month. The scraper posts the Yearly Occupancy export once a day — each day becomes a row here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-right text-sm">
        <thead>
          <tr className="bg-brand-teal text-white">
            <th className="sticky left-0 z-10 bg-brand-teal px-3 py-2 text-left font-semibold">Date</th>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-semibold">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.snapshotDate} className="border-b border-border/60 hover:bg-muted/40">
              <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-medium text-muted-foreground">
                {r.day}
              </td>
              {r.cells.map((cell, i) => (
                <td key={columns[i]!.key} className="px-3 py-1.5 tabular-nums text-foreground">
                  {cell ? pctCell(cell.occPct) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <SummaryRow
            label="Average Pickup/day"
            summaries={summaries}
            render={(s) => (
              <span className={cn("tabular-nums", varianceColorClass(s.avgPickupPerDay))}>
                {s.avgPickupPerDay == null ? "—" : formatVariancePercent(s.avgPickupPerDay)}
              </span>
            )}
          />
          <SummaryRow
            label="Increasement %"
            summaries={summaries}
            tint
            render={(s) => (
              <span className={cn("tabular-nums", varianceColorClass(s.increasementPct))}>
                {s.increasementPct == null ? "—" : formatVariancePercent(s.increasementPct)}
              </span>
            )}
          />
          <SummaryRow
            label="Occ on Hand"
            summaries={summaries}
            render={(s) => <span className="font-semibold tabular-nums">{pctCell(s.occOnHand)}</span>}
          />
          <SummaryRow
            label="Room Sold"
            summaries={summaries}
            highlight
            render={(s) => <span className="font-semibold tabular-nums">{formatNumber(s.roomSold)}</span>}
          />
          <SummaryRow
            label="ADR"
            summaries={summaries}
            render={(s) => <span className="tabular-nums">{s.adr == null ? "—" : formatIDR(Math.round(s.adr))}</span>}
          />
          <SummaryRow
            label="Revenue Nett"
            summaries={summaries}
            highlight
            render={(s) => <span className="tabular-nums">{s.revenue == null ? "—" : formatIDR(s.revenue)}</span>}
          />
        </tfoot>
      </table>
    </div>
  );
}

function SummaryRow({
  label,
  summaries,
  render,
  highlight,
  tint,
}: {
  label: string;
  summaries: PickupColumnSummary[];
  render: (s: PickupColumnSummary) => React.ReactNode;
  highlight?: boolean;
  tint?: boolean;
}) {
  const bg = highlight ? "bg-[hsl(var(--brand-gold))]/10" : tint ? "bg-secondary/40" : "bg-card";
  return (
    <tr className={cn("border-t border-border", bg)}>
      <th
        className={cn(
          "sticky left-0 z-10 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
          bg,
        )}
      >
        {label}
      </th>
      {summaries.map((s) => (
        <td key={s.key} className="px-3 py-1.5">
          {render(s)}
        </td>
      ))}
    </tr>
  );
}
