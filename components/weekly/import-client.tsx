"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  applyWeeklyImport,
  previewImport,
  type ApplyResult,
} from "@/lib/weekly/import-actions";
import {
  IMPORT_SPECS,
  csvTemplate,
  getImportSpec,
  type ParseResult,
} from "@/lib/weekly/import";

export function ImportClient({
  property,
  week,
  locked,
}: {
  property: string;
  week: string;
  locked: boolean;
}) {
  const [sectionId, setSectionId] = useState<string>(IMPORT_SPECS[0]!.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const spec = getImportSpec(sectionId)!;

  function buildFd(): FormData | null {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return null;
    }
    const fd = new FormData();
    fd.set("property", property);
    fd.set("week", week);
    fd.set("sectionId", sectionId);
    fd.set("file", file);
    return fd;
  }

  function onPreview() {
    setError(null);
    setResult(null);
    const fd = buildFd();
    if (!fd) return;
    startTransition(async () => setPreview(await previewImport(fd)));
  }

  function onApply() {
    setError(null);
    const fd = buildFd();
    if (!fd) return;
    startTransition(async () => {
      const r = await applyWeeklyImport(fd);
      setResult(r);
      if (r.ok) setPreview(null);
    });
  }

  function onDownloadTemplate() {
    const blob = new Blob([csvTemplate(spec)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weekly-${sectionId}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function changeSection(id: string) {
    setSectionId(id);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      {/* Section + template */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-foreground">Section</label>
          <select
            value={sectionId}
            onChange={(e) => changeSection(e.target.value)}
            disabled={locked}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground disabled:opacity-60"
          >
            {IMPORT_SPECS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onDownloadTemplate}>
          <Download /> Template CSV
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{spec.hint}</p>
      <p className="text-xs text-muted-foreground">
        Columns: <span className="font-mono">{spec.columns.map((c) => c.header).join(", ")}</span>
      </p>

      {/* File + actions */}
      {!locked && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <Button type="button" variant="outline" size="sm" onClick={onPreview} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />} Preview
          </Button>
          {preview?.ok && preview.rowCount > 0 && (
            <Button type="button" size="sm" onClick={onApply} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Apply {preview.rowCount} rows
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-variance-negative">{error}</p>}

      {/* Apply result */}
      {result?.ok && (
        <p className="flex items-center gap-1 text-sm text-variance-positive">
          <Check className="h-4 w-4" /> Imported {result.written} rows — the week is updated.
        </p>
      )}
      {result && !result.ok && (
        <p className="text-sm text-variance-negative">{result.message}</p>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <p className="text-sm font-medium text-foreground">
            {preview.rowCount} valid row{preview.rowCount === 1 ? "" : "s"}
            {preview.issues.length > 0 && (
              <span className="ml-2 text-variance-negative">· {preview.issues.length} issue(s)</span>
            )}
          </p>

          {preview.issues.length > 0 && (
            <ul className="space-y-1 text-sm text-variance-negative">
              {preview.issues.slice(0, 10).map((iss, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Row {iss.row}: {iss.message}
                </li>
              ))}
              {preview.issues.length > 10 && <li>…and {preview.issues.length - 10} more.</li>}
            </ul>
          )}

          {preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {spec.columns.map((c) => (
                      <th key={c.key} className="px-2 py-1 font-medium">{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {spec.columns.map((c) => (
                        <td key={c.key} className="px-2 py-1 text-foreground">
                          {row[c.key] === null || row[c.key] === undefined ? "—" : String(row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 8 && (
                <p className="px-2 pt-1 text-xs text-muted-foreground">
                  …and {preview.rows.length - 8} more rows.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
