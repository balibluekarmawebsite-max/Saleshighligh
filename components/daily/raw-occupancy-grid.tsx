"use client";

import { useState } from "react";

import { EmptyState } from "@/components/dashboard/empty-state";
import type { RawOccCell, RawOccColumn, RawOccRow } from "@/lib/daily/raw-data";
import { formatIDR, formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Metric = "roomNights" | "saleableRooms" | "occPct" | "revenue";

const METRICS: { key: Metric; label: string; hint: string }[] = [
  { key: "roomNights", label: "Room Occupied", hint: "Rooms on the books (what the % is built from)" },
  { key: "saleableRooms", label: "Saleable Rooms", hint: "Available room-nights (the % denominator)" },
  { key: "occPct", label: "Occupancy %", hint: "Room Occupied ÷ Saleable" },
  { key: "revenue", label: "Room Revenue", hint: "Revenue on the books (IDR)" },
];

function cellText(cell: RawOccCell | null, metric: Metric): string {
  if (!cell) return "—";
  switch (metric) {
    case "roomNights":
      return formatNumber(cell.roomNights);
    case "saleableRooms":
      return cell.saleableRooms == null ? "—" : formatNumber(cell.saleableRooms);
    case "occPct":
      return cell.occPct == null ? "—" : formatPct(cell.occPct);
    case "revenue":
      return cell.revenue == null ? "—" : formatIDR(cell.revenue);
  }
}

/**
 * Raw occupancy grid: rows = snapshot dates (newest first), columns = stay
 * months, cells = the RAW value the scraper pushed for the chosen metric. No
 * calculation beyond occupancy % (shown only as a convenience). The latest
 * reading is highlighted since it drives the dashboard's "Occ on Hand".
 */
export function RawOccupancyGrid({
  columns,
  rows,
  latestSnapshotDate,
}: {
  columns: RawOccColumn[];
  rows: RawOccRow[];
  latestSnapshotDate: string | null;
}) {
  const [metric, setMetric] = useState<Metric>("roomNights");

  if (columns.length === 0 || rows.length === 0) {
    return (
      <EmptyState
        title="No occupancy pushes this month"
        message="The scraper hasn't posted a Yearly Occupancy export for this property/month yet."
      />
    );
  }

  const active = METRICS.find((mm) => mm.key === metric)!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Show:</span>
        {METRICS.map((mm) => (
          <button
            key={mm.key}
            type="button"
            onClick={() => setMetric(mm.key)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              metric === mm.key
                ? "border-brand-teal bg-brand-teal text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted/60",
            )}
          >
            {mm.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{active.hint}.</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-right text-sm">
          <thead>
            <tr className="bg-brand-teal text-white">
              <th className="sticky left-0 z-10 bg-brand-teal px-3 py-2 text-left font-semibold">Date</th>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2 font-semibold">
                  {c.label}
                  {c.stayMonth === 1 ? <span className="ml-1 text-white/70">{`'${String(c.stayYear).slice(2)}`}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isLatest = r.snapshotDate === latestSnapshotDate;
              return (
                <tr
                  key={r.snapshotDate}
                  className={cn(
                    "border-b border-border/60 hover:bg-muted/40",
                    isLatest && "bg-[hsl(var(--brand-gold))]/10",
                  )}
                >
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-medium text-muted-foreground">
                    {r.snapshotDate}
                    {isLatest ? <span className="ml-1.5 rounded bg-brand-teal px-1 py-0.5 text-[10px] text-white">latest</span> : null}
                  </td>
                  {r.cells.map((cell, i) => (
                    <td key={columns[i]!.key} className="px-3 py-1.5 tabular-nums text-foreground">
                      {cellText(cell, metric)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
