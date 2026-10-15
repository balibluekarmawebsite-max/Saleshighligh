"use client";

import { useState, useTransition } from "react";
import { Check, Download, Loader2, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { baselineCsvTemplate } from "@/lib/weekly/import";
import { aiExtractBaseline, applyBaselineRows, readBaselineFile } from "@/lib/weekly/import-actions";
import { cn } from "@/lib/utils";

type Row = Record<string, string>;

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const FILE_INPUT =
  "block w-full max-w-sm text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/70";

/**
 * Upload the fixed Budget & Last Year for one property + year, as an alternative
 * to typing the two grids. Two modes, both preview before writing and MERGE
 * (update the months in the file; leave other months unchanged):
 *   • Excel / CSV — our template, or the report's own Budget/Last Year table,
 *     read deterministically (no AI needed).
 *   • AI — any layout, including a screenshot; shown only when Groq is set up.
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
  const [mode, setMode] = useState<"file" | "ai">("file");

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
            Import a year instead of typing. You review before it saves, and only the months in your
            file are updated — other months for {year} are left unchanged.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
          <Download /> Download template
        </Button>
      </div>

      <div className="mt-4 inline-flex rounded-lg border border-border p-0.5 text-sm">
        {(["file", "ai"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-colors",
              mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "file" ? "Excel / CSV" : "AI (any layout)"}
          </button>
        ))}
      </div>

      {mode === "ai" && !aiConfigured ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          AI mode needs <code className="text-xs">GROQ_API_KEY</code> set on the server (see Settings).
          Until then, use <strong>Excel / CSV</strong> — it reads our template and the report&apos;s own
          Budget &amp; Last Year table.
        </div>
      ) : (
        <ReadApply key={mode} property={property} year={year} variant={mode} />
      )}
    </div>
  );
}

function ReadApply({
  property,
  year,
  variant,
}: {
  property: string;
  year: number;
  variant: "file" | "ai";
}) {
  const ai = variant === "ai";
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [reading, startReading] = useTransition();
  const [applying, setApplying] = useState(false);

  function clear() {
    setRows(null);
    setDone(null);
    setError(null);
  }

  function read() {
    if (!file) return;
    clear();
    const fd = new FormData();
    fd.set("property", property);
    fd.set("file", file);
    startReading(async () => {
      const res = ai ? await aiExtractBaseline(fd) : await readBaselineFile(fd);
      if (!res.ok) {
        setError(res.message ?? "Could not read that file.");
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
        {ai ? (
          <>
            Upload a budget sheet in <em>any</em> layout — an Excel/CSV or a screenshot. AI reads the
            Budget and Last Year figures; you review the mapped months before saving.
          </>
        ) : (
          <>
            Upload our template, or the weekly report&apos;s own Budget / Last Year table (Excel). One
            row per month with Budget and Last Year occupancy %, ARR and revenue.
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept={ai ? ".csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp" : ".csv,.xlsx,.xls"}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            clear();
          }}
          className={FILE_INPUT}
        />
        <Button type="button" size="sm" onClick={read} disabled={!file || reading}>
          {reading ? <Loader2 className="animate-spin" /> : ai ? <Sparkles /> : <Upload />}
          {reading ? "Reading…" : ai ? "Read with AI" : "Read & preview"}
        </Button>
      </div>

      {error && <p className="text-sm text-variance-negative">{error}</p>}
      {done != null && (
        <p className="flex items-center gap-1.5 text-sm text-variance-positive">
          <Check className="h-4 w-4" /> Updated {done} month{done === 1 ? "" : "s"} for {year}.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Review the mapped months, then apply:</p>
          <PreviewTable rows={rows} />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={apply} disabled={applying}>
              {applying ? <Loader2 className="animate-spin" /> : <Check />}
              {applying ? "Applying…" : `Apply ${rows.length} month${rows.length === 1 ? "" : "s"} to ${year}`}
            </Button>
            <span className="text-xs text-muted-foreground">
              Updates these months only; occupancy is a %, money in IDR.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewTable({ rows }: { rows: Row[] }) {
  const num = (v: string | undefined): number | null => {
    const n = Number(String(v ?? "").replace(/,/g, "").trim());
    return v && String(v).trim() !== "" && Number.isFinite(n) ? n : null;
  };
  // Occupancy → 2 decimals; money (ARR / revenue) → thousand separators.
  const occ = (v: string | undefined) => {
    const n = num(v);
    return n == null ? "—" : n.toFixed(2);
  };
  const money = (v: string | undefined) => {
    const n = num(v);
    return n == null ? "—" : formatNumber(n);
  };
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
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 tabular-nums">
              <td className="px-2 py-1 text-left font-medium text-foreground">{monthLabel(r.month)}</td>
              <td className="px-2 py-1 text-right">{occ(r.budgetOcc)}</td>
              <td className="px-2 py-1 text-right">{money(r.budgetArr)}</td>
              <td className="px-2 py-1 text-right">{money(r.budgetRevenue)}</td>
              <td className="px-2 py-1 text-right">{occ(r.lastyearOcc)}</td>
              <td className="px-2 py-1 text-right">{money(r.lastyearArr)}</td>
              <td className="px-2 py-1 text-right">{money(r.lastyearRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
