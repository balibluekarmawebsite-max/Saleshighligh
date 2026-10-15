"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Check, Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { baselineCsvTemplate } from "@/lib/weekly/import";
import { importAnnualBaseline } from "@/lib/weekly/import-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Upload />}
      {pending ? "Importing…" : "Upload & apply"}
    </Button>
  );
}

/**
 * Upload the fixed Budget & Last Year for one property + year from a CSV/Excel
 * file, as an alternative to typing the two grids below by hand. Replace-all
 * for the year: the uploaded 12 months become the year's figures.
 */
export function BaselineUpload({
  property,
  year,
  locked,
}: {
  property: string;
  year: number;
  locked: boolean;
}) {
  const [state, formAction] = useFormState(importAnnualBaseline, null);

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
          <h2 className="font-serif text-lg font-semibold text-foreground">Upload (CSV / Excel)</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Import the whole year at once instead of typing. One row per month (1–12) with Budget and
            Last Year occupancy %, ARR and revenue. Uploading replaces all 12 months for {year}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
          <Download /> Download template
        </Button>
      </div>

      <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="year" value={year} />
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls"
          required
          className="block w-full max-w-sm text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-secondary/70"
        />
        <SubmitButton />
      </form>

      {state?.ok && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-variance-positive">
          <Check className="h-4 w-4" /> Imported {state.written} month{state.written === 1 ? "" : "s"} into {year}.
        </p>
      )}
      {state && !state.ok && (
        <div className="mt-3 space-y-1 text-sm text-variance-negative">
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
      )}
    </div>
  );
}
