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
}) {
  const { rows, update, add, remove } = useRows(initial);
  const [state, formAction] = useFormState(action, null);

  const totalRevenue = sumCol(rows, "grossRevenue");
  const totalRn = sumCol(rows, "rnSold");

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title={title} subtitle={subtitle} />
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
                return (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-1.5 pr-3">
                      <GridCell
                        value={row.label}
                        onChange={(v) => update(i, "label", v)}
                        locked={locked}
                        fmt="text"
                        placeholder={labelHeader}
                      />
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
