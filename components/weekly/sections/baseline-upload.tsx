"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Download, Loader2, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { baselineCsvTemplate } from "@/lib/weekly/import";
import { aiExtractBaseline, applyBaselineRows, importAnnualBaseline } from "@/lib/weekly/import-actions";
import { cn } from "@/lib/utils";

type AiRow = Record<string, string>;

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const FILE_INPUT =
  "block w-full max-w-sm text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/70";

/**
 * Upload the fixed Budget & Last Year for one property + year, as an alternative
 * to typing the two grids below. Two modes:
 *   • AI — upload any layout (Excel / CSV / screenshot); Groq maps it into our
 *     template, you review the mapped rows, then apply.
 *   • Template — a strict CSV in our exact column order.
 * Replace-all per side for the year.
 */
export function BaselineUpload({
  property,
  year,
  locked,
  aiConfigured,
}: {
  property: string;
  year: number;
  locked: boolean;
  aiConfigured: boolean;
}) {
  const [mode, setMode] = useState<"ai" | "template">(aiConfigured ? "ai" : "template");

  if (locked) return null;

  function downloadTemplate() {
    const blob = new Blob([baselineCsvTemplate()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-lastyear-${property}-${year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold text-foreground">Upload</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Import the whole year at once instead of typing. Applying replaces the months present
            for {year}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
          <Download /> Download template
        </Button>
      </div>

      {aiConfigured && (
        <div className="mt-4 inline-flex rounded-lg border border-border p-0.5 text-sm">
          {(["ai", "template"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "ai" ? "AI (any layout)" : "Template file"}
            </button>
          ))}
        </div>
      )}

      {mode === "ai" && aiConfigured ? (
        <AiMode property={property} year={year} />
      ) : (
        <TemplateMode property={property} year={year} />
      )}
    </div>
  );
}

function TemplateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Upload />}
      {pending ? "Importing…" : "Upload & apply"}
    </Button>
  );
}

function TemplateMode({ property, year }: { property: string; year: number }) {
  const [state, formAction] = useFormState(importAnnualBaseline, null);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        A CSV / Excel in our exact column order — one row per month (1–12) with Budget and Last Year
        occupancy %, ARR and revenue.
      </p>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="year" value={year} />
        <input type="file" name="file" accept=".csv,.xlsx,.xls" required className={FILE_INPUT} />
        <TemplateSubmit />
      </form>
      <Result state={state} year={year} />
    </div>
  );
}

function AiMode({ property, year }: { property: string; year: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<AiRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [reading, startReading] = useTransition();
  const [applying, setApplying] = useState(false);

  function reset() {
    setRows(null);
    setDone(null);
    setError(null);
  }

  function read() {
    if (!file) return;
    reset();
    const fd = new FormData();
    fd.set("property", property);
    fd.set("file", file);
    startReading(async () => {
      const res = await aiExtractBaseline(fd);
      if (!res.ok) {
        setError(res.message ?? "AI could not read that file.");
        return;
      }
      setRows(res.rows ?? []);
    });
  }

  async function apply() {
    if (!rows || rows.length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await applyBaselineRows({ property, year, rows });
      if (!res.ok) {
        setError(res.message ?? "Could not apply the rows.");
        return;
      }
      setDone(res.written ?? rows.length);
      setRows(null);
      setFile(null);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Upload a budget sheet in <em>any</em> layout — an Excel/CSV or even a screenshot. AI reads
        the Budget and Last Year figures and maps them into our template; you review before anything
        is saved.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            reset();
          }}
          className={FILE_INPUT}
        />
        <Button type="button" size="sm" onClick={read} disabled={!file || reading}>
          {reading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {reading ? "Reading…" : "Read with AI"}
        </Button>
      </div>

      {error && <p className="text-sm text-variance-negative">{error}</p>}
      {done != null && (
        <p className="flex items-center gap-1.5 text-sm text-variance-positive">
          <Check className="h-4 w-4" /> Applied {done} month{done === 1 ? "" : "s"} to {year}.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Mapped from your file — review, then apply:
          </p>
          <PreviewTable rows={rows} />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={apply} disabled={applying}>
              {applying ? <Loader2 className="animate-spin" /> : <Check />}
              {applying ? "Applying…" : `Apply ${rows.length} month${rows.length === 1 ? "" : "s"} to ${year}`}
            </Button>
            <span className="text-xs text-muted-foreground">
              Replaces the months shown; occupancy is a %, money in IDR.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewTable({ rows }: { rows: AiRow[] }) {
  const cell = (v: string | undefined) => (v && String(v).trim() !== "" ? v : "—");
  const monthLabel = (m: string | undefined) => {
    const n = Number(m);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? MONTHS[n] : m && m.trim() !== "" ? m : "—";
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-muted-foreground">
            <th className="px-2 py-1.5 text-left">Month</th>
            <th className="px-2 py-1.5 text-right">Budget Occ%</th>
            <th className="px-2 py-1.5 text-right">Budget ARR</th>
            <th className="px-2 py-1.5 text-right">Budget Rev</th>
            <th className="px-2 py-1.5 text-right">LY Occ%</th>
            <th className="px-2 py-1.5 text-right">LY ARR</th>
            <th className="px-2 py-1.5 text-right">LY Rev</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r, i) => (
            <tr key={i} className="border-b border-border/60 tabular-nums">
              <td className="px-2 py-1 text-left font-medium text-foreground">{monthLabel(r.month)}</td>
              <td className="px-2 py-1 text-right">{cell(r.budgetOcc)}</td>
              <td className="px-2 py-1 text-right">{cell(r.budgetArr)}</td>
              <td className="px-2 py-1 text-right">{cell(r.budgetRevenue)}</td>
              <td className="px-2 py-1 text-right">{cell(r.lastyearOcc)}</td>
              <td className="px-2 py-1 text-right">{cell(r.lastyearArr)}</td>
              <td className="px-2 py-1 text-right">{cell(r.lastyearRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Result({
  state,
  year,
}: {
  state: { ok: boolean; written?: number; message?: string; issues?: { row: number; message: string }[] } | null;
  year: number;
}) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-variance-positive">
        <Check className="h-4 w-4" /> Imported {state.written} month{state.written === 1 ? "" : "s"} into {year}.
      </p>
    );
  }
  return (
    <div className="space-y-1 text-sm text-variance-negative">
      <p>{state.message}</p>
      {state.issues && state.issues.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {state.issues.slice(0, 8).map((iss, i) => (
            <li key={i}>
              {iss.row > 0 ? `Row ${iss.row}: ` : ""}
              {iss.message}
            </li>
          ))}
          {state.issues.length > 8 && <li>…and {state.issues.length - 8} more.</li>}
        </ul>
      )}
    </div>
  );
}
