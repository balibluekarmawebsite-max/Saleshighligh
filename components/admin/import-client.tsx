"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";

import {
  commitWorkbook,
  validateWorkbook,
  type CommitResult,
  type ValidateResult,
} from "@/app/admin/import/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PropertyOption } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

function buildFormData(property: string, period: string, file: File): FormData {
  const fd = new FormData();
  fd.append("property", property);
  fd.append("period", period);
  fd.append("file", file);
  return fd;
}

export function ImportClient({ properties }: { properties: PropertyOption[] }) {
  const [property, setProperty] = useState(properties[0]?.code ?? "BKDS");
  const [period, setPeriod] = useState("2026-06");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setValidation(null);
    setCommitResult(null);
  }

  function onValidate() {
    if (!file) return;
    setCommitResult(null);
    const fd = buildFormData(property, period, file);
    startTransition(async () => {
      setValidation(await validateWorkbook(fd));
    });
  }

  function onCommit() {
    if (!file) return;
    const fd = buildFormData(property, period, file);
    startTransition(async () => {
      setCommitResult(await commitWorkbook(fd));
    });
  }

  const errorCount =
    validation?.issues?.filter((i) => i.severity === "error").length ?? 0;
  const warningCount =
    validation?.issues?.filter((i) => i.severity === "warning").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Select and upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Property</span>
              <select
                value={property}
                onChange={(e) => {
                  setProperty(e.target.value);
                  reset();
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {properties.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Month</span>
              <input
                type="month"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  reset();
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) {
                setFile(dropped);
                reset();
              }
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragging ? "border-primary bg-accent/50" : "border-border",
            )}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag & drop the filled <code>.xlsx</code> here, or
            </p>
            <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
              browse to choose a file
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const chosen = e.target.files?.[0] ?? null;
                  setFile(chosen);
                  reset();
                }}
              />
            </label>
            {file && (
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-brand-teal" />
                {file.name}
              </p>
            )}
          </div>

          <Button onClick={onValidate} disabled={!file || pending}>
            {pending && !commitResult ? "Validating…" : "Validate"}
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {validation && !validation.error && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                File property/period:{" "}
                <span className="font-medium text-foreground">
                  {validation.meta?.propertyCode ?? "—"} /{" "}
                  {validation.meta?.period ?? "—"}
                </span>
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  validation.ok
                    ? "bg-secondary text-variance-positive"
                    : "bg-secondary text-variance-negative",
                )}
              >
                {validation.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <TriangleAlert className="h-3.5 w-3.5" />
                )}
                {errorCount} errors · {warningCount} warnings
              </span>
              <span className="text-muted-foreground">
                {validation.totalRows} rows total
              </span>
            </div>

            {/* Row counts */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(validation.counts ?? {}).map(([tab, count]) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium",
                    count > 0
                      ? "border-border bg-secondary text-secondary-foreground"
                      : "border-border/60 text-muted-foreground",
                  )}
                >
                  {tab}: {count}
                </span>
              ))}
            </div>

            {/* Issues */}
            {validation.issues && validation.issues.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Severity</th>
                      <th className="py-2 pr-4 font-medium">Tab</th>
                      <th className="py-2 pr-4 font-medium">Row</th>
                      <th className="py-2 pr-4 font-medium">Column</th>
                      <th className="py-2 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.issues.map((issue, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td
                          className={cn(
                            "py-2 pr-4 font-medium",
                            issue.severity === "error"
                              ? "text-variance-negative"
                              : "text-brand-gold-dark",
                          )}
                        >
                          {issue.severity}
                        </td>
                        <td className="py-2 pr-4 text-foreground">{issue.tab}</td>
                        <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                          {issue.row ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {issue.column ?? "—"}
                        </td>
                        <td className="py-2 text-foreground">{issue.problem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={onCommit} disabled={!validation.ok || pending}>
                {pending && commitResult === null ? "Importing…" : "Confirm & Import"}
              </Button>
              {!validation.ok && (
                <span className="text-sm text-muted-foreground">
                  Fix the errors above and re-validate before importing.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {validation?.error && (
        <p className="text-sm text-variance-negative">{validation.error}</p>
      )}

      {/* Result */}
      {commitResult && (
        <Card>
          <CardContent className="p-5">
            {commitResult.ok ? (
              <div className="space-y-2">
                <p className="inline-flex items-center gap-2 font-medium text-variance-positive">
                  <CheckCircle2 className="h-5 w-5" />
                  Import complete
                </p>
                <p className="text-sm text-muted-foreground">
                  Written to {property} / {period}:{" "}
                  {Object.entries(commitResult.written ?? {})
                    .filter(([, c]) => c > 0)
                    .map(([tab, c]) => `${tab} (${c})`)
                    .join(", ") || "no rows"}
                  .
                </p>
              </div>
            ) : (
              <p className="inline-flex items-center gap-2 font-medium text-variance-negative">
                <TriangleAlert className="h-5 w-5" />
                {commitResult.message ?? "Import failed."}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
