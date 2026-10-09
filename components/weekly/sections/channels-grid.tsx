"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { channelYtd, sharePercent } from "@/lib/weekly/calculations";
import { saveChannels } from "@/lib/weekly/editor-actions";
import {
  GridCell,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  dispNum,
  dispPct,
  toNum,
  type Row,
} from "@/components/weekly/sections/shared";

const MONTHS: { key: string; label: string }[] = [
  { key: "jan", label: "Jan" }, { key: "feb", label: "Feb" }, { key: "mar", label: "Mar" },
  { key: "apr", label: "Apr" }, { key: "may", label: "May" }, { key: "jun", label: "Jun" },
  { key: "jul", label: "Jul" }, { key: "aug", label: "Aug" }, { key: "sep", label: "Sep" },
  { key: "oct", label: "Oct" }, { key: "nov", label: "Nov" }, { key: "dec", label: "Dec" },
];

const blankChannelRow = (): Row => ({
  sourceLabel: "",
  jan: "", feb: "", mar: "", apr: "", may: "", jun: "",
  jul: "", aug: "", sep: "", oct: "", nov: "", dec: "",
});

/** Sections E/F — Channel Inside: room nights by source and month (YTD / % computed). */
export function ChannelsGrid({
  property,
  week,
  locked,
  defaultYear,
  years,
  byYear,
}: {
  property: string;
  week: string;
  locked: boolean;
  defaultYear: number;
  years: number[];
  byYear: Record<string, Row[]>;
}) {
  const [year, setYear] = useState(defaultYear);
  const [rowsByYear, setRowsByYear] = useState<Record<string, Row[]>>(byYear);
  const [state, formAction] = useFormState(saveChannels, null);

  const sig = JSON.stringify(byYear);
  useEffect(() => {
    setRowsByYear(JSON.parse(sig) as Record<string, Row[]>);
  }, [sig]);

  const yKey = String(year);
  const rows = rowsByYear[yKey] ?? [];
  const setRows = (next: (rs: Row[]) => Row[]) =>
    setRowsByYear((b) => ({ ...b, [yKey]: next(b[yKey] ?? []) }));
  const update = (i: number, key: string, val: string) =>
    setRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, [key]: val } : r)));

  const ytdOf = (row: Row) => channelYtd(MONTHS.map((m) => toNum(row[m.key])));
  const grandYtd = rows.reduce((s, r) => s + ytdOf(r), 0);

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title="E / F · Channel Inside (Room Nights)"
            subtitle="Room nights by source and month. YTD and % are calculated."
          />
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={locked}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {!locked && <SaveButton state={state} />}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 text-left">Source</th>
                {MONTHS.map((m) => (
                  <th key={m.key} className="py-2 px-1.5 text-right">{m.label}</th>
                ))}
                <th className="py-2 px-2 text-right">YTD</th>
                <th className="py-2 px-2 text-right">%</th>
                <th className="w-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={16} className="py-6 text-center text-muted-foreground">
                    No sources yet for {year}.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-1.5 pr-3">
                    <GridCell
                      value={row.sourceLabel}
                      onChange={(v) => update(i, "sourceLabel", v)}
                      locked={locked}
                      fmt="text"
                      minW="min-w-[9rem]"
                      placeholder="Source"
                    />
                  </td>
                  {MONTHS.map((m) => (
                    <td key={m.key} className="py-1.5 px-1">
                      <GridCell
                        value={row[m.key]}
                        onChange={(v) => update(i, m.key, v)}
                        locked={locked}
                        fmt="num"
                        minW="min-w-[3.25rem]"
                      />
                    </td>
                  ))}
                  <td className="py-1.5 px-2 text-right font-medium tabular-nums text-foreground">
                    {dispNum(ytdOf(row))}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                    {dispPct(sharePercent(ytdOf(row), grandYtd))}
                  </td>
                  <td className="py-1.5 text-right">
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => setRows((rs) => rs.filter((_, ri) => ri !== i))}
                        className="text-muted-foreground transition-colors hover:text-variance-negative"
                        aria-label="Remove source"
                      >
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
                <td colSpan={12} />
                <td className="py-2 px-2 text-right tabular-nums">{dispNum(grandYtd)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{dispPct(rows.length ? 100 : null)}</td>
                <td />
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
              onClick={() => setRows((rs) => [...rs, blankChannelRow()])}
            >
              <Plus /> Add source
            </Button>
          </div>
        )}
      </form>
    </SectionCardShell>
  );
}
