"use client";

import { useFormState } from "react-dom";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiTextActions } from "@/components/weekly/ai-text-actions";
import { saveSection } from "@/lib/weekly/editor-actions";
import {
  CELL,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  useRows,
  type Row,
} from "@/components/weekly/sections/shared";

/** Sections G & G2 — activity cards (date + subject/task + notes with AI helpers). */
export function ActivitiesCards({
  property,
  week,
  locked,
  sectionId,
  title,
  subtitle,
  subjectLabel,
  addLabel,
  initial,
}: {
  property: string;
  week: string;
  locked: boolean;
  sectionId: string;
  title: string;
  subtitle: string;
  subjectLabel: string;
  addLabel: string;
  initial: Row[];
}) {
  const { rows, update, add, remove } = useRows(initial);
  const [state, formAction] = useFormState(saveSection, null);

  return (
    <SectionCardShell>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="sectionId" value={sectionId} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title={title} subtitle={subtitle} />
          {!locked && <SaveButton state={state} />}
        </div>

        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No activities yet.</p>
        )}

        {rows.map((row, i) => (
          <div
            key={i}
            className="relative flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row"
          >
            {!locked && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-variance-negative"
                aria-label="Remove activity"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="w-full shrink-0 space-y-3 sm:w-48">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Date
                </label>
                <input
                  value={row.dateLabel ?? ""}
                  onChange={(e) => update(i, "dateLabel", e.target.value)}
                  disabled={locked}
                  className={CELL}
                  placeholder="e.g. 25 Sep 2026"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {subjectLabel}
                </label>
                <input
                  value={row.title ?? ""}
                  onChange={(e) => update(i, "title", e.target.value)}
                  disabled={locked}
                  className={CELL}
                  placeholder={subjectLabel}
                />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2 pr-6 sm:pr-0">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Notes / Remarks
              </label>
              <textarea
                value={row.notes ?? ""}
                onChange={(e) => update(i, "notes", e.target.value)}
                disabled={locked}
                rows={3}
                className={`${CELL} resize-y`}
                placeholder="Details…"
              />
              {!locked && (
                <AiTextActions value={row.notes ?? ""} onResult={(t) => update(i, "notes", t)} />
              )}
            </div>
          </div>
        ))}

        {!locked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={() => add({ dateLabel: "", title: "", notes: "" })}
          >
            <Plus /> {addLabel}
          </Button>
        )}
      </form>
    </SectionCardShell>
  );
}
