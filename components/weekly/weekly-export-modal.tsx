"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  WEEKLY_DEFAULT_SECTION_IDS,
  WEEKLY_EXPORT_SECTIONS,
} from "@/lib/weekly/export/sections";
import { cn } from "@/lib/utils";

type WeeklyFormat = "pdf" | "xlsx" | "docx";

const FORMATS = [
  ["pdf", "PDF", FileText],
  ["xlsx", "Excel", FileSpreadsheet],
  ["docx", "Word", FileType],
] as const;

/** Export one weekly report as PDF, Excel, or Word, with a section picker. */
export function WeeklyExportModal({ property, week }: { property: string; week: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(WEEKLY_DEFAULT_SECTION_IDS));
  const [format, setFormat] = useState<WeeklyFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function download() {
    const secs = WEEKLY_EXPORT_SECTIONS.filter((s) => selected.has(s.id)).map((s) => s.id).join(",");
    if (!secs) {
      setError("Select at least one section.");
      return;
    }
    const href = `/api/weekly/export/${format}?property=${encodeURIComponent(property)}&week=${encodeURIComponent(week)}&sections=${secs}`;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${property}-${week}-weekly-report.${format}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = name;
      a.click();
      URL.revokeObjectURL(objUrl);
      setOpen(false);
    } catch {
      setError("Export failed — the server could not generate the file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Export</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold text-foreground">Export weekly report</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-4">
              {/* Format */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Format</p>
                <div className="flex gap-2">
                  {FORMATS.map(([val, label, Icon]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFormat(val)}
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                        format === val ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section tree */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sections</p>
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-primary hover:underline" onClick={() => setSelected(new Set(WEEKLY_DEFAULT_SECTION_IDS))}>All</button>
                    <button type="button" className="text-primary hover:underline" onClick={() => setSelected(new Set())}>None</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {WEEKLY_EXPORT_SECTIONS.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-variance-negative">{error}</p>}
              {format === "pdf" && (
                <p className="text-xs text-muted-foreground">PDF rendering runs a headless browser on the server and can take several seconds.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" className="gap-2" onClick={download} disabled={busy}>
                <Download className="h-4 w-4" />
                {busy ? "Generating…" : `Download ${format.toUpperCase()}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
