"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  extractSojernAction,
  saveSojernAction,
} from "@/app/dashboard/[property]/[period]/market/actions";
import { UploadControls, type UploadImage } from "@/components/sales/upload-controls";
import type { SojernData } from "@/lib/dashboard-data";
import { MONTH_LABELS, SOJERN_METRICS } from "@/lib/sales/sojern-logic";
import { cn } from "@/lib/utils";

const METRIC_LABEL: Record<string, string> = { FLIGHT: "Flight Volume Index", HOTEL: "Hotel Volume Index" };

function defaultYears(period: string): number[] {
  const y = Number(period.slice(0, 4));
  if (!Number.isFinite(y)) return [2023, 2024, 2025, 2026];
  return [y - 3, y - 2, y - 1, y];
}

const cellKey = (metric: string, year: number, month: number) => `${metric}_${year}_${month}`;

function seedPoints(initial: SojernData | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of initial?.points ?? []) out[cellKey(p.metric, p.year, p.month)] = String(p.valuePct);
  return out;
}

export function SojernUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: SojernData | null;
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [originCountry, setOriginCountry] = useState(initial?.originCountry ?? "(All)");
  const [eventType, setEventType] = useState(initial?.eventType ?? "Booking");
  const [timePeriod, setTimePeriod] = useState(initial?.timePeriod ?? "Monthly");
  const [baselineLabel, setBaselineLabel] = useState(initial?.baselineLabel ?? "Jan 2023");
  const [years, setYears] = useState<number[]>(initial?.years?.length ? initial.years : defaultYears(period));
  const [points, setPoints] = useState<Record<string, string>>(() => seedPoints(initial));
  const [text, setText] = useState("");
  const [image, setImage] = useState<UploadImage>(null);
  const [busyKind, setBusyKind] = useState<null | "compile" | "save">(null);
  const busy = busyKind !== null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCell = (metric: string, year: number, month: number, v: string) =>
    setPoints((p) => ({ ...p, [cellKey(metric, year, month)]: v }));

  function compile() {
    setMsg(null);
    setBusyKind("compile");
    void (async () => {
      try {
        const r = await extractSojernAction({
          property,
          text: text.trim() || null,
          imageBase64: image?.base64 ?? null,
          imageMediaType: image?.mediaType ?? null,
        });
        if (r.ok && r.points) {
          if (r.meta) {
            if (r.meta.destination && r.meta.destination !== "—") setDestination(r.meta.destination);
            if (r.meta.originCountry) setOriginCountry(r.meta.originCountry);
            if (r.meta.eventType) setEventType(r.meta.eventType);
            if (r.meta.timePeriod) setTimePeriod(r.meta.timePeriod);
            if (r.meta.baselineLabel) setBaselineLabel(r.meta.baselineLabel);
          }
          // Expand the year columns to cover any years the AI read.
          const aiYears = Array.from(new Set(r.points.map((p) => p.year)));
          setYears((ys) => Array.from(new Set([...ys, ...aiYears])).sort((a, b) => a - b));
          setPoints((prev) => {
            const next = { ...prev };
            for (const p of r.points!) next[cellKey(p.metric, p.year, p.month)] = String(p.valuePct);
            return next;
          });
          setMsg({ ok: true, text: `Read ${r.points.length} index point(s) — review, then save.` });
        } else {
          setMsg({ ok: false, text: r.error ?? "Could not read that." });
        }
      } catch {
        setMsg({ ok: false, text: "Could not compile — please try again." });
      } finally {
        setBusyKind(null);
      }
    })();
  }

  function save() {
    setMsg(null);
    setBusyKind("save");
    void (async () => {
      try {
        const pts: { metric: string; year: number; month: number; value: string }[] = [];
        for (const metric of SOJERN_METRICS) {
          for (const year of years) {
            for (let month = 1; month <= 12; month++) {
              const v = points[cellKey(metric, year, month)];
              if (v != null && String(v).trim() !== "") pts.push({ metric, year, month, value: v });
            }
          }
        }
        const r = await saveSojernAction({
          property,
          period,
          meta: { destination, originCountry, eventType, timePeriod, baselineLabel },
          points: pts,
        });
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) {
          setOpen(false);
          router.refresh();
        }
      } finally {
        setBusyKind(null);
      }
    })();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10">
        {hasData ? "Edit / re-upload" : "Upload / compile with AI"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Sojern Market Overview — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Attach the Sojern Flight &amp; Hotel Volume Index charts or paste the figures, then compile — or type them in. Each
        cell is the % difference vs the baseline for that year &amp; month.
      </p>

      <UploadControls
        compact
        placeholder="Paste the Sojern flight &amp; hotel volume index figures (year, month, % vs baseline)…"
        text={text}
        onText={setText}
        image={image}
        onImage={setImage}
        onCompile={compile}
        working={busyKind === "compile"}
        disabled={busy}
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Destination
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Indonesia, Bali"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Origin Country
          <input value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} placeholder="(All)"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Event Type
          <input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="Booking"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Time Period
          <input value={timePeriod} onChange={(e) => setTimePeriod(e.target.value)} placeholder="Monthly"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Baseline
          <input value={baselineLabel} onChange={(e) => setBaselineLabel(e.target.value)} placeholder="Jan 2023"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
      </div>

      {SOJERN_METRICS.map((metric) => (
        <div key={metric}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{METRIC_LABEL[metric]} — % vs {baselineLabel}</p>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5">Month</th>
                  {years.map((y) => (
                    <th key={y} className="px-2 py-1.5 text-right">{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTH_LABELS.map((label, idx) => {
                  const month = idx + 1;
                  return (
                    <tr key={month} className="border-b border-border/60">
                      <td className="px-2 py-1.5 text-xs text-foreground">{label}</td>
                      {years.map((y) => (
                        <td key={y} className="px-2 py-1.5">
                          <input
                            value={points[cellKey(metric, y, month)] ?? ""}
                            onChange={(e) => setCell(metric, y, month, e.target.value)}
                            inputMode="decimal"
                            placeholder="%"
                            className="w-16 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50">
          {busyKind === "save" ? "Saving…" : "Save Sojern Market Overview"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
