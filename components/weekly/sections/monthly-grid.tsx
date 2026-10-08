"use client";

import { useFormState } from "react-dom";

import { rate } from "@/lib/weekly/calculations";
import { saveMonthlyStats } from "@/lib/weekly/editor-actions";
import {
  CELL,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  dispNum,
  sumCol,
  type Row,
  useRows,
} from "@/components/weekly/sections/shared";

const OCC = ["occActual", "occBudget", "occLy"] as const;
const ARR = ["arrActual", "arrBudget", "arrLy"] as const;

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

  const cell = (i: number, key: string, align = "text-right") => (
    <input
      inputMode="numeric"
      value={rows[i]?.[key] ?? ""}
      onChange={(e) => update(i, key, e.target.value)}
      disabled={locked}
      className={`${CELL} ${align} min-w-[5.5rem]`}
    />
  );

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title="B · YTD Actual & Forecast"
            subtitle="Per month: RN Sold, Occupancy %, ARR and Revenue. Occupancy is entered as a percent; totals are calculated."
          />
          {!locked && <SaveButton state={state} />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th rowSpan={2} className="py-2 pr-3 text-left align-bottom">Month</th>
                <th rowSpan={2} className="py-2 px-2 text-right align-bottom">RN Sold</th>
                <th colSpan={3} className="border-b border-border py-1 px-2 text-center">Occupancy %</th>
                <th colSpan={3} className="border-b border-border py-1 px-2 text-center">ARR</th>
                <th colSpan={2} className="border-b border-border py-1 px-2 text-center">Revenue</th>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.month ?? i} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 font-medium text-foreground">{row.monthLabel}</td>
                  <td className="py-1.5 px-2">{cell(i, "rnSold")}</td>
                  {OCC.map((k) => (
                    <td key={k} className="py-1.5 px-2">{cell(i, k)}</td>
                  ))}
                  {ARR.map((k) => (
                    <td key={k} className="py-1.5 px-2">{cell(i, k)}</td>
                  ))}
                  <td className="py-1.5 px-2">{cell(i, "revActual")}</td>
                  <td className="py-1.5 px-2">{cell(i, "revBudget")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold text-foreground">
                <td className="py-2 pr-3">Total / YTD</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(rnTotal)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(rate(revAct, rnTotal))}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(rate(revBud, rnTotal))}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">—</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(revAct)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(revBud)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </form>
    </SectionCardShell>
  );
}
