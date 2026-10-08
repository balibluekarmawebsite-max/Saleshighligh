"use client";

import { useFormState } from "react-dom";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveSection } from "@/lib/weekly/editor-actions";
import {
  CELL,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  useRows,
  type Row,
} from "@/components/weekly/sections/shared";

const STATUSES = ["On progress", "Done", "To do", "On hold"];

/** Section H — Graphic Design Report: a Task / Status tracker (stored as activities). */
export function GraphicDesignTable({
  property,
  week,
  locked,
  initial,
}: {
  property: string;
  week: string;
  locked: boolean;
  initial: Row[];
}) {
  const { rows, update, add, remove } = useRows(initial);
  const [state, formAction] = useFormState(saveSection, null);

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="sectionId" value="graphic_design" />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title="Graphic Design Report" subtitle="Design tasks and their status." />
          {!locked && <SaveButton state={state} />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Task</th>
                <th className="py-2 px-3">Status</th>
                <th className="w-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">No tasks yet.</td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <td className="py-1.5 pr-3">
                    <textarea
                      value={row.title ?? ""}
                      onChange={(e) => update(i, "title", e.target.value)}
                      disabled={locked}
                      rows={1}
                      className={`${CELL} resize-y`}
                      placeholder="Task"
                    />
                  </td>
                  <td className="py-1.5 px-3">
                    <select
                      value={row.notes ?? ""}
                      onChange={(e) => update(i, "notes", e.target.value)}
                      disabled={locked}
                      className={`${CELL} min-w-[8rem]`}
                    >
                      <option value="">—</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="text-muted-foreground transition-colors hover:text-variance-negative"
                        aria-label="Remove task"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!locked && (
          <div className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => add({ title: "", notes: "" })}>
              <Plus /> Add task
            </Button>
          </div>
        )}
      </form>
    </SectionCardShell>
  );
}
