"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { csvTemplate, getImportSpec } from "@/lib/weekly/import";
import { applyAiImport } from "@/lib/weekly/import/ai-actions";
import { DETERMINISTIC_SECTION_IDS, getAiImportSection } from "@/lib/weekly/import/ai-sections";
import { cn } from "@/lib/utils";

type Row = Record<string, string>;

/**
 * Inline, per-section importer embedded directly in the report editor: upload a
 * CSV / Excel / screenshot (or paste text), preview the parsed rows, and apply
 * them to THIS section — without leaving the editor for the Data Import page.
 * On apply the editor route revalidates, so the grid below refreshes itself.
 */
export function SectionImport({
  property,
  week,
  locked,
  sectionId,
  aiConfigured,
  defaultYear,
  defaultPlatform,
  forceCategory,
}: {
  property: string;
  week: string;
  locked: boolean;
  sectionId: string;
  aiConfigured: boolean;
  defaultYear?: number;
  defaultPlatform?: string;
  /**
   * When set, every imported row's `category` is overwritten with this value
   * before preview/apply — used for the per-category Action Plan cards so a file
   * dropped on "Offline Agent" imports into that category only (and replaces only
   * it). An empty string targets the uncategorized bucket.
   */
  forceCategory?: string;
}) {
  const section = getAiImportSection(sectionId);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [year, setYear] = useState(defaultYear ?? new Date().getFullYear());
  const [platform, setPlatform] = useState(defaultPlatform ?? "Instagram");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [processing, startProcessing] = useTransition();
  const [applying, startApplying] = useTransition();

  // Nothing to import into a locked report, or for an unknown section id.
  if (!section || locked) return null;

  const spec = section.csvTemplateId ? getImportSpec(section.csvTemplateId) : undefined;
  const canProcessOffline = mode === "file" && DETERMINISTIC_SECTION_IDS.has(section.id);
  // The category is fixed by the card, so don't preview it as a column.
  const previewFields =
    forceCategory !== undefined ? section.fields.filter((fl) => fl.key !== "category") : section.fields;
  const headingText = forceCategory !== undefined ? "Import plans from a file" : "Import this section from a file";

  function reset() {
    setRows(null);
    setError(null);
    setDone(null);
  }

  function process() {
    setError(null);
    setDone(null);
    const fd = new FormData();
    fd.set("property", property);
    fd.set("week", week);
    fd.set("section", section!.id);
    if (section!.needsYear) fd.set("year", String(year));
    if (section!.needsPlatform) fd.set("platform", platform);
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
          setError(data.error ?? "The import failed.");
          setRows(null);
          return;
        }
        const parsed = data.rows ?? [];
        // Per-category Action Plan card: force every row into this card's
        // category so the import targets (and replaces) only that category.
        setRows(forceCategory !== undefined ? parsed.map((r) => ({ ...r, category: forceCategory })) : parsed);
        if (data.note) setError(data.note);
      } catch {
        setError("Could not reach the import service.");
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
        section: section!.id,
        rows,
        year: section!.needsYear ? year : undefined,
        platform: section!.needsPlatform ? platform : undefined,
      });
      if (r.ok) {
        setDone(r.written ?? 0);
        setRows(null);
        if (fileRef.current) fileRef.current.value = "";
        setText("");
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
    a.download = `weekly-${section!.id}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <Upload className="h-4 w-4 text-primary" />
          {headingText}
          <span className="font-normal text-muted-foreground">— CSV, Excel{aiConfigured ? " or a screenshot" : ""}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open ? "" : "-rotate-90")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 p-4">
          {!aiConfigured && !canProcessOffline && (
            <p className="flex items-start gap-2 rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 px-3 py-2 text-xs text-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--brand-gold))]" />
              AI reading is off for this section (needs <code className="mx-1 font-mono">GROQ_API_KEY</code>). A plain CSV/Excel in the template layout still works.
            </p>
          )}

          {/* Section-specific controls */}
          <div className="flex flex-wrap items-end gap-3">
            {section.needsYear && (
              <label className="text-sm">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Year</span>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="h-9 w-24 rounded-md border border-border bg-card px-2 text-sm"
                />
              </label>
            )}
            {section.needsPlatform && (
              <label className="text-sm">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Platform</span>
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
                onClick={() => { setMode(m); reset(); }}
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
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,image/png,image/jpeg,image/webp"
              onChange={reset}
              className="block text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          ) : (
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); reset(); }}
              rows={5}
              placeholder="Paste rows, notes, or a copied table — the AI will structure and tidy it."
              className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={process} disabled={processing || (!aiConfigured && !canProcessOffline)}>
              {processing ? <Loader2 className="animate-spin" /> : aiConfigured ? <Sparkles /> : <Upload />}
              {processing ? "Reading…" : aiConfigured ? "Process with AI" : "Read file"}
            </Button>
            {rows && rows.length > 0 && (
              <Button type="button" variant="default" onClick={apply} disabled={applying}>
                {applying ? <Loader2 className="animate-spin" /> : <Check />} Apply {rows.length} row{rows.length === 1 ? "" : "s"}
              </Button>
            )}
            {(rows || error || done !== null) && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-variance-negative">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          {done !== null && (
            <p className="flex items-center gap-1 text-sm text-variance-positive">
              <Check className="h-4 w-4" /> Imported {done} row{done === 1 ? "" : "s"} — this section is updated below.
            </p>
          )}

          {rows && rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    {previewFields.map((fl) => (
                      <th key={fl.key} className="px-2 py-1.5 font-medium">{fl.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 12).map((row, i) => (
                    <tr key={i} className="border-b border-border/60">
                      {previewFields.map((fl) => (
                        <td key={fl.key} className="px-2 py-1 text-foreground">{row[fl.key] ? row[fl.key] : "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 12 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">…and {rows.length - 12} more rows.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
