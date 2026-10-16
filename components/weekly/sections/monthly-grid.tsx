"use client";

import Link from "next/link";
import { useFormState } from "react-dom";

import { rate } from "@/lib/weekly/calculations";
import { saveMonthlyStats } from "@/lib/weekly/editor-actions";
import { weeklyHref } from "@/lib/nav";
import {
  GridCell,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  dispNum,
  dispPct,
  sumCol,
  toNum,
  type CellFmt,
  type Row,
  useRows,
} from "@/components/weekly/sections/shared";

const OCC = ["occActual", "occBudget", "occLy"] as const;
const ARR = ["arrActual", "arrBudget", "arrLy"] as const;

/** Actual columns the week owns (editable); everything else is a fixed reference. */
const EDITABLE = new Set(["rnSold", "occActual", "arrActual", "revActual"]);

/** Section B — the 12-month Actual / Budget / Last-Year grid. */
export function MonthlyGrid({
  property,
  week,
  locked,
  initial,
}: {
  property: string;
  week: string;
  locked: boolean;
  initial: Row[];
}) {
  const { rows, update } = useRows(initial);
  const [state, formAction] = useFormState(saveMonthlyStats, null);

  const rnTotal = sumCol(rows, "rnSold");
  const revAct = sumCol(rows, "revActual");
  const revBud = sumCol(rows, "revBudget");
  const revLy = sumCol(rows, "revLy");

  // Occupancy total = simple average across the months that actually carry a
  // value (a 1-year average, per request); blank months don't drag it down.
  const avgCol = (key: string) => {
    const vals = rows.map((r) => toNum(r[key])).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  // Actuals are editable while the report is open; Budget & Last Year are fixed
  // annual references (managed on the Budget & Last Year page), shown read-only.
  const cell = (i: number, key: string, fmt: CellFmt = "num") => (
    <GridCell
      value={rows[i]?.[key]}
      onChange={(v) => update(i, key, v)}
      locked={locked || !EDITABLE.has(key)}
      fmt={fmt}
      minW="min-w-[5.5rem]"
    />
  );

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionHeading
              title="B · YTD Actual & Forecast"
              subtitle="Actuals sync from the PMS (and can be edited). Occupancy is entered as a percent; totals are calculated."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Budget and Last Year are fixed yearly references shown read-only here —
              set them once on the{" "}
              <Link href={weeklyHref(property, week, "baseline")} className="font-medium text-primary hover:underline">
                Budget &amp; Last Year
              </Link>{" "}
              page and they apply to every weekly report.
            </p>
          </div>
          {!locked && <SaveButton state={state} />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th rowSpan={2} className="py-2 pr-3 text-left align-bottom">Month</th>
                <th rowSpan={2} className="py-2 px-2 text-right align-bottom">RN Sold</th>
                <th colSpan={3} className="border-b border-border py-1 px-2 text-center">Occupancy %</th>
                <th colSpan={3} className="border-b border-border py-1 px-2 text-center">ARR</th>
                <th colSpan={3} className="border-b border-border py-1 px-2 text-center">Revenue</th>
              </tr>
              <tr className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-1 px-2 text-right">Act</th>
                <th className="py-1 px-2 text-right">Bud</th>
                <th className="py-1 px-2 text-right">LY</th>
                <th className="py-1 px-2 text-right">Act</th>
                <th className="py-1 px-2 text-right">Bud</th>
                <th className="py-1 px-2 text-right">LY</th>
                <th className="py-1 px-2 text-right">Act</th>
                <th className="py-1 px-2 text-right">Bud</th>
                <th className="py-1 px-2 text-right">LY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.month ?? i} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 font-medium text-foreground">{row.monthLabel}</td>
                  <td className="py-1.5 px-2">{cell(i, "rnSold")}</td>
                  {OCC.map((k) => (
                    <td key={k} className="py-1.5 px-2">{cell(i, k, "pct2")}</td>
                  ))}
                  {ARR.map((k) => (
                    <td key={k} className="py-1.5 px-2">{cell(i, k)}</td>
                  ))}
                  <td className="py-1.5 px-2">{cell(i, "revActual")}</td>
                  <td className="py-1.5 px-2">{cell(i, "revBudget")}</td>
                  <td className="py-1.5 px-2">{cell(i, "revLy")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold text-foreground">
                <td className="py-2 pr-3">Total / YTD</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(rnTotal)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispPct(avgCol("occActual"))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispPct(avgCol("occBudget"))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispPct(avgCol("occLy"))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(rate(revAct, rnTotal))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(rate(revBud, rnTotal))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(rate(revLy, rnTotal))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(revAct)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(revBud)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(revLy)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </form>
    </SectionCardShell>
  );
}
