"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { weeklyHref } from "@/lib/nav";
import { csvTemplate, getImportSpec } from "@/lib/weekly/import";
import { applyAiImport } from "@/lib/weekly/import/ai-actions";
import {
  AI_IMPORT_SECTIONS,
  getAiImportSection,
  type AiImportSection,
} from "@/lib/weekly/import/ai-sections";
import type { WeeklyEditorSectionKey } from "@/lib/weekly/editor-data";
import { cn } from "@/lib/utils";

type Row = Record<string, string>;

export function AiImportClient({
  property,
  week,
  weekLabel,
  locked,
  aiConfigured,
  defaultYear,
  completion,
}: {
  property: string;
  week: string;
  weekLabel: string;
  locked: boolean;
  aiConfigured: boolean;
  defaultYear: number;
  completion: Record<WeeklyEditorSectionKey, boolean>;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [workbookOpen, setWorkbookOpen] = useState(false);

  const section = active ? getAiImportSection(active) : null;

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      {!section ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-foreground">Import by section</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Upload a CSV, Excel, or a screenshot for one section at a time — the AI arranges it
                into the report format. Only that section is replaced.
              </p>
            </div>
            <div className="rounded-md border border-border px-3 py-1.5 text-right">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Week</p>
              <p className="text-sm font-medium text-foreground">{weekLabel}</p>
            </div>
          </div>

          {!aiConfigured && (
            <p className="flex items-start gap-2 rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 px-3 py-2 text-sm text-foreground">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand-gold))]" />
              AI import is off — set <code className="mx-1 font-mono text-xs">GROQ_API_KEY</code> on the
              server to read files and screenshots. Plain CSV/Excel still works once it&apos;s on.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AI_IMPORT_SECTIONS.filter((s) => s.id !== "social").map((s) => {
              const done = completion[s.completionKey];
              return (
                <div key={s.id} className="flex flex-col rounded-lg border border-border p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-serif text-base font-semibold leading-snug text-foreground">{s.title}</h3>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        done ? "bg-variance-positive/10 text-variance-positive" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {done ? "Filled" : "Empty"}
                    </span>
                  </div>
                  <p className="mb-3 flex-1 text-sm text-muted-foreground">{s.description}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={locked}
                    onClick={() => setActive(s.id)}
                  >
                    Import
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Social Media (Section H)</span> is now pulled directly from
            Metricool — sync it from the report&apos;s Section H, or assign the brand in Settings → Social Media. No manual
            import needed.
          </p>

          <WorkbookPanel
            property={property}
            week={week}
            defaultYear={defaultYear}
            locked={locked}
            aiConfigured={aiConfigured}
            open={workbookOpen}
            onToggle={() => setWorkbookOpen((v) => !v)}
          />
        </>
      ) : (
        <SectionPanel
          section={section}
          property={property}
          week={week}
          locked={locked}
          aiConfigured={aiConfigured}
          defaultYear={defaultYear}
          onBack={() => setActive(null)}
        />
      )}
    </div>
  );
}

function SectionPanel({
  section,
  property,
  week,
  locked,
  aiConfigured,
  defaultYear,
  onBack,
}: {
  section: AiImportSection;
  property: string;
  week: string;
  locked: boolean;
  aiConfigured: boolean;
  defaultYear: number;
  onBack: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [year, setYear] = useState(defaultYear);
  const [platform, setPlatform] = useState("Instagram");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [processing, startProcessing] = useTransition();
  const [applying, startApplying] = useTransition();

  const spec = section.csvTemplateId ? getImportSpec(section.csvTemplateId) : undefined;

  function process() {
    setError(null);
    setDone(null);
    const fd = new FormData();
    fd.set("property", property);
    fd.set("week", week);
    fd.set("section", section.id);
    if (section.needsYear) fd.set("year", String(year));
    if (section.needsPlatform) fd.set("platform", platform);
    if (mode === "file") {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("Choose a file first.");
        return;
      }
      fd.set("file", file);
    } else {
      if (!text.trim()) {
        setError("Paste some text first.");
        return;
      }
      fd.set("text", text);
    }
    startProcessing(async () => {
      try {
        const res = await fetch("/api/weekly/import/ai", { method: "POST", body: fd });
        const data = (await res.json()) as { ok?: boolean; rows?: Row[]; error?: string; note?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "The AI import failed.");
          setRows(null);
          return;
        }
        setRows(data.rows ?? []);
        if (data.note) setError(data.note);
      } catch {
        setError("Could not reach the AI import service.");
      }
    });
  }

  function apply() {
    if (!rows || rows.length === 0) return;
    setError(null);
    startApplying(async () => {
      const r = await applyAiImport({
        property,
        week,
        section: section.id,
        rows,
        year: section.needsYear ? year : undefined,
        platform: section.needsPlatform ? platform : undefined,
      });
      if (r.ok) {
        setDone(r.written ?? 0);
        setRows(null);
      } else {
        setError(r.message ?? "Apply failed.");
      }
    });
  }

  function downloadTemplate() {
    if (!spec) return;
    const blob = new Blob([csvTemplate(spec)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-${section.id}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-semibold text-foreground">{section.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tip: you can also type these in directly (with{" "}
            <Sparkles className="inline h-3.5 w-3.5 text-[hsl(var(--brand-gold))]" /> AI rephrase) in the{" "}
            <Link href={weeklyHref(property, week, "editor")} className="text-primary hover:underline">
              Report Editor
            </Link>
            .
          </p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> All sections
        </button>
      </div>

      {locked ? (
        <p className="text-sm text-muted-foreground">This report is locked — reopen it to import.</p>
      ) : (
        <>
          {/* Section-specific controls */}
          <div className="flex flex-wrap items-end gap-4">
            {section.needsYear && (
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Year</span>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="h-9 w-28 rounded-md border border-border bg-card px-2 text-sm"
                />
              </label>
            )}
            {section.needsPlatform && (
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform</span>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="h-9 rounded-md border border-border bg-card px-2 text-sm"
                >
                  {["Instagram", "Facebook", "TikTok", "YouTube"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
            )}
            {spec && (
              <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={downloadTemplate}>
                <Download /> Template CSV
              </Button>
            )}
          </div>

          {/* Input method */}
          <div className="inline-flex rounded-md border border-border p-0.5 text-sm">
            {(["file", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded px-3 py-1 font-medium transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "file" ? "Upload file" : "Paste text"}
              </button>
            ))}
          </div>

          {mode === "file" ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Upload file (CSV, Excel or screenshot)</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,image/png,image/jpeg,image/webp"
                className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Paste text</p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Paste rows, notes, or a copied table — the AI will structure and tidy it."
                className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={process} disabled={processing || !aiConfigured}>
              {processing ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {processing ? "Reading…" : "Process with AI"}
            </Button>
            {rows && rows.length > 0 && (
              <Button type="button" variant="default" onClick={apply} disabled={applying}>
                {applying ? <Loader2 className="animate-spin" /> : <Check />} Apply {rows.length} row{rows.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-variance-negative">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          {done !== null && (
            <p className="flex items-center gap-1 text-sm text-variance-positive">
              <Check className="h-4 w-4" /> Imported {done} row{done === 1 ? "" : "s"} — the section is updated.
            </p>
          )}

          {rows && rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border bg-muted/20">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    {section.fields.map((fl) => (
                      <th key={fl.key} className="px-2 py-1.5 font-medium">{fl.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 15).map((row, i) => (
                    <tr key={i} className="border-b border-border/60">
                      {section.fields.map((fl) => (
                        <td key={fl.key} className="px-2 py-1 text-foreground">
                          {row[fl.key] ? row[fl.key] : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 15 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">…and {rows.length - 15} more rows.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WorkbookPanel({
  property,
  week,
  defaultYear,
  locked,
  aiConfigured,
  open,
  onToggle,
}: {
  property: string;
  week: string;
  defaultYear: number;
  locked: boolean;
  aiConfigured: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ section: string; title: string; count: number }[] | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function run() {
    setError(null);
    setApplied(null);
    setResult(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an .xlsx workbook first.");
      return;
    }
    const fd = new FormData();
    fd.set("property", property);
    fd.set("week", week);
    fd.set("year", String(defaultYear));
    fd.set("file", file);
    startBusy(async () => {
      try {
        const res = await fetch("/api/weekly/import/ai/workbook", { method: "POST", body: fd });
        const data = (await res.json()) as {
          ok?: boolean;
          applied?: { section: string; title: string; count: number }[];
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Workbook import failed.");
          return;
        }
        const list = data.applied ?? [];
        setResult(list);
        setApplied(`Imported ${list.reduce((s, x) => s + x.count, 0)} rows across ${list.length} section(s).`);
      } catch {
        setError("Could not reach the workbook import service.");
      }
    });
  }

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-sm font-medium text-primary"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")} />
        Import a full weekly-report workbook (all sections at once)
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {!aiConfigured ? (
            <p className="text-sm text-muted-foreground">Set GROQ_API_KEY to enable workbook import.</p>
          ) : locked ? (
            <p className="text-sm text-muted-foreground">This report is locked — reopen it to import.</p>
          ) : (
            <>
              <div className="rounded-lg border border-dashed border-[hsl(var(--brand-gold))]/40 bg-muted/20 p-6 text-center">
                <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Drop a weekly-report Excel file, or choose one</p>
                <p className="mb-3 text-xs text-muted-foreground">.xlsx or .xls · up to 20 MB · the AI maps each sheet to its section</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="mx-auto block text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium" />
              </div>
              <Button type="button" onClick={run} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                {busy ? "Reading workbook…" : "Import workbook"}
              </Button>
              {error && <p className="text-sm text-variance-negative">{error}</p>}
              {applied && <p className="flex items-center gap-1 text-sm text-variance-positive"><Check className="h-4 w-4" /> {applied}</p>}
              {result && result.length > 0 && (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.map((r) => (
                    <li key={r.section}>· {r.title}: {r.count} row{r.count === 1 ? "" : "s"}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
