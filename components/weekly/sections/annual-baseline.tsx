"use client";

import { useFormState } from "react-dom";

import { saveAnnualBaseline } from "@/lib/weekly/editor-actions";
import {
  GridCell,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  dispNum,
  sumCol,
  type Row,
  useRows,
} from "@/components/weekly/sections/shared";

/** One fixed-reference grid (Budget or Last Year): 12 months × Occ% / ARR / Revenue. */
function BaselineGrid({
  title,
  subtitle,
  rows,
  update,
  locked,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
  update: (i: number, key: string, val: string) => void;
  locked: boolean;
}) {
  const revTotal = sumCol(rows, "revenue");

  return (
    <div>
      <h3 className="font-serif text-base font-semibold text-foreground">{title}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 text-left">Month</th>
              <th className="py-2 px-2 text-right">Occupancy %</th>
              <th className="py-2 px-2 text-right">ARR</th>
              <th className="py-2 px-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.month ?? i} className="border-b border-border/60">
                <td className="py-1.5 pr-3 font-medium text-foreground">{row.monthLabel}</td>
                <td className="py-1.5 px-2">
                  <GridCell value={row.occ} onChange={(v) => update(i, "occ", v)} locked={locked} fmt="pct2" minW="min-w-[5.5rem]" />
                </td>
                <td className="py-1.5 px-2">
                  <GridCell value={row.arr} onChange={(v) => update(i, "arr", v)} locked={locked} fmt="num" minW="min-w-[7rem]" />
                </td>
                <td className="py-1.5 px-2">
                  <GridCell value={row.revenue} onChange={(v) => update(i, "revenue", v)} locked={locked} fmt="num" minW="min-w-[8rem]" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold text-foreground">
              <td className="py-2 pr-3">Total / YTD</td>
              <td className="py-2 px-2 text-right text-muted-foreground">—</td>
              <td className="py-2 px-2 text-right text-muted-foreground">—</td>
              <td className="py-2 px-2 text-right tabular-nums">{dispNum(revTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * Budget & Last Year — the fixed annual references for one property + year.
 * Both are set once and apply (read-only) to every weekly report of that year.
 * Occupancy is entered as a percent; the blended ARR total uses room nights
 * where present (room nights are optional and not shown as a column).
 */
export function AnnualBaseline({
  property,
  year,
  budget,
  lastyear,
  locked,
}: {
  property: string;
  year: number;
  budget: Row[];
  lastyear: Row[];
  locked: boolean;
}) {
  const b = useRows(budget);
  const ly = useRows(lastyear);
  const [state, formAction] = useFormState(saveAnnualBaseline, null);

  return (
    <SectionCardShell>
      <form action={formAction} className="space-y-8">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="budget" value={JSON.stringify(b.rows)} />
        <input type="hidden" name="lastyear" value={JSON.stringify(ly.rows)} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title={`Budget & Last Year — ${year}`}
            subtitle="Fixed yearly references for Section B. Set once per property and year; every weekly report reads them read-only. Occupancy is entered as a percent, money in IDR."
          />
          {!locked && <SaveButton state={state} />}
        </div>

        <BaselineGrid
          title="1 · Budget"
          subtitle="The yearly plan — budgeted occupancy, ARR and revenue per month."
          rows={b.rows}
          update={b.update}
          locked={locked}
        />
        <BaselineGrid
          title="2 · Last Year"
          subtitle="The prior year's actuals, used as the Last Year comparison per month."
          rows={ly.rows}
          update={ly.update}
          locked={locked}
        />

        {locked && (
          <p className="text-xs text-muted-foreground">
            You don&apos;t have edit access to {property}. Values are shown read-only.
          </p>
        )}
      </form>
    </SectionCardShell>
  );
}
