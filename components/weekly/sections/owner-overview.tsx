"use client";

import { useFormState } from "react-dom";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { rate, sharePercent } from "@/lib/weekly/calculations";
import { saveOwnerOverview } from "@/lib/weekly/editor-actions";
import {
  CELL,
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

/** Owner Overview — repeater-guest monthly performance + channel-mix grids. */
export function OwnerOverview({
  property,
  week,
  locked,
  repeaters,
  mix,
}: {
  property: string;
  week: string;
  locked: boolean;
  repeaters: Row[];
  mix: Row[];
}) {
  const rep = useRows(repeaters);
  const cm = useRows(mix);
  const [state, formAction] = useFormState(saveOwnerOverview, null);

  const repRn = sumCol(rep.rows, "roomNights");
  const repRev = sumCol(rep.rows, "revenue");
  const cmRn = sumCol(cm.rows, "rnSold");
  const cmRev = sumCol(cm.rows, "grossRevenue");

  return (
    <SectionCardShell>
      <form action={formAction} className="space-y-8">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="repeaters" value={JSON.stringify(rep.rows)} />
        <input type="hidden" name="mix" value={JSON.stringify(cm.rows)} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title="Owner Overview" subtitle="A concise, owner-facing snapshot." />
          {!locked && <SaveButton state={state} />}
        </div>

        {/* 1 · Repeater Guest — Room Performance */}
        <div>
          <h3 className="font-serif text-base font-semibold text-foreground">
            1 · Repeater Guest — Room Performance
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">ADR is calculated from revenue ÷ room nights.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 text-left">Month</th>
                  <th className="py-2 px-3 text-right">Room Nights</th>
                  <th className="py-2 px-3 text-right">ADR</th>
                  <th className="py-2 px-3 text-right">Revenue</th>
                  <th className="w-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {rep.rows.length === 0 && (
                  <tr><td colSpan={5} className="py-5 text-center text-muted-foreground">No months yet.</td></tr>
                )}
                {rep.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-1.5 pr-3">
                      <input
                        value={row.label ?? ""}
                        onChange={(e) => rep.update(i, "label", e.target.value)}
                        disabled={locked}
                        className={`${CELL} min-w-[9rem]`}
                        placeholder="e.g. September 2026"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        inputMode="numeric"
                        value={row.roomNights ?? ""}
                        onChange={(e) => rep.update(i, "roomNights", e.target.value)}
                        disabled={locked}
                        className={`${CELL} text-right`}
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {dispNum(rate(toNum(row.revenue), toNum(row.roomNights)))}
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        inputMode="numeric"
                        value={row.revenue ?? ""}
                        onChange={(e) => rep.update(i, "revenue", e.target.value)}
                        disabled={locked}
                        className={`${CELL} text-right`}
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      {!locked && (
                        <button type="button" onClick={() => rep.remove(i)} aria-label="Remove month"
                          className="text-muted-foreground transition-colors hover:text-variance-negative">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-foreground">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 px-3 text-right tabular-nums">{dispNum(repRn)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{dispNum(rate(repRev, repRn))}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{dispNum(repRev)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {!locked && (
            <Button type="button" variant="outline" size="sm" className="mt-3"
              onClick={() => rep.add({ label: "", roomNights: "", revenue: "" })}>
              <Plus /> Add month
            </Button>
          )}
        </div>

        {/* 2 · Channel Mix (Market Segmentation) */}
        <div>
          <h3 className="font-serif text-base font-semibold text-foreground">
            2 · Channel Mix (Market Segmentation)
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">ARR and % share are calculated.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 text-left">Source</th>
                  <th className="py-2 px-3 text-right">RN Sold</th>
                  <th className="py-2 px-3 text-right">ARR</th>
                  <th className="py-2 px-3 text-right">Revenue</th>
                  <th className="py-2 px-3 text-right">%</th>
                  <th className="w-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {cm.rows.length === 0 && (
                  <tr><td colSpan={6} className="py-5 text-center text-muted-foreground">No sources yet.</td></tr>
                )}
                {cm.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-1.5 pr-3">
                      <input
                        value={row.label ?? ""}
                        onChange={(e) => cm.update(i, "label", e.target.value)}
                        disabled={locked}
                        className={`${CELL} min-w-[11rem]`}
                        placeholder="e.g. OTA"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        inputMode="numeric"
                        value={row.rnSold ?? ""}
                        onChange={(e) => cm.update(i, "rnSold", e.target.value)}
                        disabled={locked}
                        className={`${CELL} text-right`}
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {dispNum(rate(toNum(row.grossRevenue), toNum(row.rnSold)))}
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        inputMode="numeric"
                        value={row.grossRevenue ?? ""}
                        onChange={(e) => cm.update(i, "grossRevenue", e.target.value)}
                        disabled={locked}
                        className={`${CELL} text-right`}
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {dispPct(sharePercent(toNum(row.grossRevenue), cmRev))}
                    </td>
                    <td className="py-1.5 text-right">
                      {!locked && (
                        <button type="button" onClick={() => cm.remove(i)} aria-label="Remove source"
                          className="text-muted-foreground transition-colors hover:text-variance-negative">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-foreground">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 px-3 text-right tabular-nums">{dispNum(cmRn)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{dispNum(rate(cmRev, cmRn))}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{dispNum(cmRev)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{dispPct(cm.rows.length ? 100 : null)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {!locked && (
            <Button type="button" variant="outline" size="sm" className="mt-3"
              onClick={() => cm.add({ label: "", rnSold: "", grossRevenue: "" })}>
              <Plus /> Add source
            </Button>
          )}
        </div>
      </form>
    </SectionCardShell>
  );
}
