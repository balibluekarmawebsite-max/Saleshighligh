"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveSection } from "@/lib/weekly/editor-actions";
import { type SectionField } from "@/lib/weekly/sections";

type Row = Record<string, string>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

/** Generic add/remove/edit row editor for a Department Inputs section. */
export function SectionEditor({
  property,
  week,
  sectionId,
  fields,
  initialRows,
  locked,
}: {
  property: string;
  week: string;
  sectionId: string;
  fields: SectionField[];
  initialRows: Row[];
  locked: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [state, formAction] = useFormState(saveSection, null);

  const blankRow = (): Row =>
    Object.fromEntries(fields.map((f) => [f.key, f.key === "platform" ? "Instagram" : ""]));
  const update = (i: number, key: string, val: string) =>
    setRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, [key]: val } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, ri) => ri !== i));

  const inputCls =
    "w-full rounded border border-border bg-card px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="rows" value={JSON.stringify(rows)} />

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No rows yet.</p>
      )}

      {rows.map((row, i) => (
        <div
          key={i}
          className="flex flex-wrap items-start gap-2 rounded-md border border-border p-2"
        >
          {fields.map((f) => (
            <div key={f.key} className="min-w-[120px] flex-1">
              <label className="mb-0.5 block text-[11px] text-muted-foreground">
                {f.label}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  value={row[f.key] ?? ""}
                  onChange={(e) => update(i, f.key, e.target.value)}
                  disabled={locked}
                  rows={2}
                  className={inputCls}
                />
              ) : f.type === "select" ? (
                <select
                  value={row[f.key] ?? ""}
                  onChange={(e) => update(i, f.key, e.target.value)}
                  disabled={locked}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={row[f.key] ?? ""}
                  onChange={(e) => update(i, f.key, e.target.value)}
                  disabled={locked}
                  className={inputCls}
                />
              )}
            </div>
          ))}
          {!locked && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-5 shrink-0 text-muted-foreground transition-colors hover:text-variance-negative"
              aria-label="Remove row"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus /> Add row
          </Button>
          <SubmitButton />
          {state?.ok && (
            <span className="flex items-center gap-1 text-sm text-variance-positive">
              <Check className="h-4 w-4" /> {state.message}
            </span>
          )}
          {state && !state.ok && (
            <span className="text-sm text-variance-negative">{state.message}</span>
          )}
        </div>
      )}
    </form>
  );
}
