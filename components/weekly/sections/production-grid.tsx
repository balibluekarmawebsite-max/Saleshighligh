"use client";

import { useFormState } from "react-dom";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { rate, sharePercent } from "@/lib/weekly/calculations";
import type { ActionResult } from "@/lib/weekly/editor-actions";
import {
  GridCell,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  dispNum,
  dispPct,
  sumCol,
  toNum,
  useRows,
  type Row,
} from "@/components/weekly/sections/shared";

type SaveAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Reusable production grid (Sections C & D): one row per segment / rate code
 * with Room Nights + Revenue entered and ARR + % share computed live.
 */
export function ProductionGrid({
  property,
  week,
  locked,
  title,
  subtitle,
  labelHeader,
  addLabel,
  initial,
  action,
  dropZeroRevenue = false,
}: {
  property: string;
  week: string;
  locked: boolean;
  title: string;
  subtitle: string;
  labelHeader: string;
  addLabel: string;
  initial: Row[];
  action: SaveAction;
  /** Treat a row with zero revenue as a tentative booking: dim it and leave it
   *  out of the Total, to match the report (which omits it entirely). */
  dropZeroRevenue?: boolean;
}) {
  const { rows, update, add, remove } = useRows(initial);
  const [state, formAction] = useFormState(action, null);

  const isTentative = (row: Row): boolean =>
    dropZeroRevenue && (toNum(row.grossRevenue) ?? 0) <= 0;

  const totalRevenue = sumCol(rows, "grossRevenue");
  // Tentative (zero-revenue) rows are excluded from the Total so the editor
  // matches the report; their revenue is already 0, so only RN needs excluding.
  const totalRn = rows.reduce(
    (s, r) => s + (isTentative(r) ? 0 : toNum(r.rnSold) ?? 0),
    0,
  );

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionHeading title={title} subtitle={subtitle} />
            {dropZeroRevenue && (
              <p className="mt-1 text-xs text-muted-foreground">
                Sources with zero revenue are tentative bookings — shown dimmed and left off the report.
              </p>
            )}
          </div>
          {!locked && <SaveButton state={state} />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">{labelHeader}</th>
                <th className="py-2 px-3 text-right">RN Sold</th>
                <th className="py-2 px-3 text-right">ARR</th>
                <th className="py-2 px-3 text-right">Revenue</th>
                <th className="py-2 px-3 text-right">%</th>
                <th className="w-8 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No rows yet.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => {
                const rev = toNum(row.grossRevenue);
                const rn = toNum(row.rnSold);
                const tentative = isTentative(row);
                return (
                  <tr
                    key={i}
                    className={`border-b border-border/60${tentative ? " opacity-55" : ""}`}
                    title={tentative ? "Tentative booking (no revenue) — left off the report" : undefined}
                  >
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-2">
                        <GridCell
                          value={row.label}
                          onChange={(v) => update(i, "label", v)}
                          locked={locked}
                          fmt="text"
                          placeholder={labelHeader}
                        />
                        {tentative && (
                          <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Tentative
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-3">
                      <GridCell
                        value={row.rnSold}
                        onChange={(v) => update(i, "rnSold", v)}
                        locked={locked}
                        fmt="num"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {dispNum(rate(rev, rn))}
                    </td>
                    <td className="py-1.5 px-3">
                      <GridCell
                        value={row.grossRevenue}
                        onChange={(v) => update(i, "grossRevenue", v)}
                        locked={locked}
                        fmt="num"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {dispPct(sharePercent(rev, totalRevenue))}
                    </td>
                    <td className="py-1.5 text-right">
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="text-muted-foreground transition-colors hover:text-variance-negative"
                          aria-label="Remove row"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold text-foreground">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 text-right tabular-nums">{dispNum(totalRn)}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {dispNum(rate(totalRevenue, totalRn))}
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{dispNum(totalRevenue)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{dispPct(rows.length ? 100 : null)}</td>
                <td className="py-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        {!locked && (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => add({ label: "", segmentGroup: "", rnSold: "", grossRevenue: "" })}
            >
              <Plus /> {addLabel}
            </Button>
          </div>
        )}
      </form>
    </SectionCardShell>
  );
}
