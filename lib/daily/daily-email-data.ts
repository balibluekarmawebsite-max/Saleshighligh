/**
 * Builds the per-property summary that the automated Daily Report email shows.
 * Reuses the same read-side the dashboard page uses (getPickupReport), so the
 * email figures always match the on-screen Occupancy Pick-Up grid.
 */

import { getDailyShellData, getPickupReport } from "@/lib/daily/pickup-report-data";

export interface DailyEmailColumn {
  label: string; // "Oct 26"
  occOnHand: number | null; // %
  roomSold: number;
  revenue: number | null; // IDR
  adr: number | null; // IDR
  increasementPct: number | null; // pickup since the first reading, points
}

export interface DailyEmailProperty {
  code: string;
  name: string;
  monthLabel: string; // "October 2026"
  asOf: string | null; // latest snapshot date (yyyy-mm-dd)
  columns: DailyEmailColumn[];
}

export interface DailyEmailData {
  properties: DailyEmailProperty[];
  /** Newest snapshot date across all properties, or null if there's no data. */
  asOf: string | null;
}

/**
 * Gather each property's latest-month pickup summary (current month + the next
 * few), newest snapshot first. Properties with no data are skipped.
 */
export async function buildDailyEmailData(maxMonths = 6): Promise<DailyEmailData> {
  const shell = await getDailyShellData();
  const properties: DailyEmailProperty[] = [];

  for (const p of shell.properties) {
    const months = shell.monthsByProperty[p.code] ?? [];
    const latest = months[0]; // newest first
    if (!latest) continue;

    const report = await getPickupReport(p.code, latest.month);
    if (!report || report.columns.length === 0) continue;

    const asOf = report.rows.at(-1)?.snapshotDate ?? null;
    const columns: DailyEmailColumn[] = report.columns.slice(0, maxMonths).map((c, i) => {
      const s = report.summaries[i];
      return {
        label: `${c.label} ${String(c.stayYear).slice(2)}`,
        occOnHand: s?.occOnHand ?? null,
        roomSold: s?.roomSold ?? 0,
        revenue: s?.revenue ?? null,
        adr: s?.adr ?? null,
        increasementPct: s?.increasementPct ?? null,
      };
    });

    properties.push({ code: p.code, name: p.name, monthLabel: report.monthLabel, asOf, columns });
  }

  const asOf =
    properties
      .map((p) => p.asOf)
      .filter((d): d is string => d != null)
      .sort()
      .at(-1) ?? null;

  return { properties, asOf };
}
