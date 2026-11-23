"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  extractSpaPerformanceAction,
  saveSpaPerformanceAction,
} from "@/app/dashboard/[property]/[period]/spa/actions";
import type { SpaSegmentRow } from "@/lib/dashboard-data";
import { toInt, toNum } from "@/lib/sales/restaurant-sources-logic";
import {
  SPA_SEGMENTS,
  SPA_SEGMENT_LABEL,
  avgCheck,
  normalizeSpaPerf,
  spaPerfTotals,
  variancePct,
  type SpaSegment,
} from "@/lib/sales/spa-performance-logic";
import { formatIDR, formatNumber, formatVariancePercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cell = "coversActual" | "coversBudget" | "revenueActual" | "revenueBudget";
type GridRow = Record<Cell, string>;
type Grid = Record<SpaSegment, GridRow>;

const blankRow = (): GridRow => ({ coversActual: "", coversBudget: "", revenueActual: "", revenueBudget: "" });

function fromInitial(initial: SpaSegmentRow[]): Grid {
  const grid = Object.fromEntries(SPA_SEGMENTS.map((s) => [s, blankRow()])) as Grid;
  for (const r of initial) {
    const seg = r.segment as SpaSegment;
    if (!grid[seg]) continue;
    grid[seg] = {
      coversActual: String(r.coversActual),
      coversBudget: String(r.coversBudget),
      revenueActual: String(r.revenueActual),
      revenueBudget: String(r.revenueBudget),
    };
  }
  return grid;
}

/** Turn the grid into raw rows for normalize / save / live preview. */
function gridToRaw(grid: Grid) {
  return SPA_SEGMENTS.map((segment) => ({ segment, ...grid[segment] }));
}

export function SpaPerformanceUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: SpaSegmentRow[];
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [grid, setGrid] = useState<Grid>(() => fromInitial(initial));
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Live totals, run through the SAME normalization as save so the TOTAL row
  // matches exactly what will be stored.
  const normalized = normalizeSpaPerf(gridToRaw(grid));
  const totals = spaPerfTotals(normalized);

  function pickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      setImage({ base64, mediaType: file.type || "image/png", name: file.name });
    };
    reader.readAsDataURL(file);
  }

  function setCell(seg: SpaSegment, field: Cell, value: string) {
    setGrid((g) => ({ ...g, [seg]: { ...g[seg], [field]: value } }));
  }

  function compile() {
    setMsg(null);
    startBusy(async () => {
      const r = await extractSpaPerformanceAction({
        property,
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
      });
      if (r.ok && r.segments) {
        setGrid((g) => {
          const next = { ...g };
          for (const s of r.segments!) {
            next[s.segment] = {
              coversActual: String(s.coversActual),
              coversBudget: String(s.coversBudget),
              revenueActual: String(s.revenueActual),
              revenueBudget: String(s.revenueBudget),
            };
          }
          return next;
        });
        setMsg({ ok: true, text: `Read ${r.segments.length} segment(s) — review the table below, then save.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not read the table." });
      }
    });
  }

  function save() {
    const segments = gridToRaw(grid);
    if (normalizeSpaPerf(segments).length === 0) {
      setMsg({ ok: false, text: "Enter covers or revenue for at least one segment." });
      return;
    }
    setMsg(null);
    startBusy(async () => {
      const r = await saveSpaPerformanceAction({ property, period, segments });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        // Processed: collapse the uploader to the toggle button and let the
        // refreshed preview table below show the saved figures.
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
      >
        {hasData ? "Edit / re-upload" : "Upload / compile with AI"}
      </button>
    );
  }

  const numInput = (seg: SpaSegment, field: Cell, w: string) => (
    <input
      value={grid[seg][field]}
      onChange={(e) => setCell(seg, field, e.target.value)}
      inputMode="numeric"
      placeholder="0"
      className={cn(
        w,
        "rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none",
      )}
    />
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Guest Segment Performance — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the performance table or attach a screenshot/file, then compile with AI — or type the numbers straight into
        the grid. Only covers and revenue (actual + budget) are stored; the average check, %, variance and TOTAL are computed.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the guest-segment table (segment, cover, revenue — actual &amp; budget)…"
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickImage(e.target.files?.[0]);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          {image ? `📎 ${image.name}` : "Attach screenshot / file"}
        </button>
        {image && (
          <button type="button" onClick={() => setImage(null)} className="text-xs text-variance-negative hover:underline">
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={compile}
          disabled={busy || (!text.trim() && !image)}
          className="ml-auto rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {busy ? "Working…" : "Compile with AI"}
        </button>
      </div>

      {/* Fixed 3-segment grid with a live derived preview (avg check, achievement, TOTAL). */}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-2 py-1.5">Segment</th>
              <th className="px-2 py-1.5 text-right">Cover (Act)</th>
              <th className="px-2 py-1.5 text-right">Cover (Bud)</th>
              <th className="px-2 py-1.5 text-right">Revenue (Act)</th>
              <th className="px-2 py-1.5 text-right">Revenue (Bud)</th>
              <th className="px-2 py-1.5 text-right">Avg Check</th>
              <th className="px-2 py-1.5 text-right">Rev Ach %</th>
            </tr>
          </thead>
          <tbody>
            {SPA_SEGMENTS.map((seg) => {
              // Clamp the same way save does, so the per-row preview never
              // disagrees with the stored value on a stray negative.
              const cA = Math.max(0, toInt(grid[seg].coversActual) ?? 0);
              const rA = Math.max(0, toNum(grid[seg].revenueActual) ?? 0);
              const rB = Math.max(0, toNum(grid[seg].revenueBudget) ?? 0);
              const avg = avgCheck(rA, cA);
              const ach = variancePct(rA, rB);
              return (
                <tr key={seg} className="border-b border-border/60">
                  <td className="px-2 py-1.5 text-xs font-medium text-foreground">{SPA_SEGMENT_LABEL[seg]}</td>
                  <td className="px-2 py-1.5">{numInput(seg, "coversActual", "w-20")}</td>
                  <td className="px-2 py-1.5">{numInput(seg, "coversBudget", "w-20")}</td>
                  <td className="px-2 py-1.5">{numInput(seg, "revenueActual", "w-32")}</td>
                  <td className="px-2 py-1.5">{numInput(seg, "revenueBudget", "w-32")}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{avg !== null ? formatIDR(avg) : "—"}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{ach !== null ? formatVariancePercent(ach) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border text-xs font-semibold text-foreground">
              <td className="px-2 py-1.5">TOTAL</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(totals.coversActual)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(totals.coversBudget)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatIDR(totals.revenueActual)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatIDR(totals.revenueBudget)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {avgCheck(totals.revenueActual, totals.coversActual) !== null ? formatIDR(avgCheck(totals.revenueActual, totals.coversActual)!) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {variancePct(totals.revenueActual, totals.revenueBudget) !== null ? formatVariancePercent(variancePct(totals.revenueActual, totals.revenueBudget)!) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save performance"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
