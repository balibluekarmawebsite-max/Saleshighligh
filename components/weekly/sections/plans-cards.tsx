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
} from "@/components/weekly/sections/shared";

/** Section J — Next Week Action Plan (grouped by category; plan has AI helpers). */
export function PlansCards({
  property,
  week,
  locked,
  initial,
}: {
  property: string;
  week: string;
  locked: boolean;
  initial: Record<string, string>[];
}) {
  const { rows, update, add, remove } = useRows(initial);
  const [state, formAction] = useFormState(saveSection, null);

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {node}
    </div>
  );

  return (
    <SectionCardShell>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="sectionId" value="action_plans" />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title="J · Next Week Action Plan"
            subtitle="Group by category, e.g. Offline Agent, Room Promotion, Marketing."
          />
          {!locked && <SaveButton state={state} />}
        </div>

        {rows.length === 0 && <p className="text-sm text-muted-foreground">No plans yet.</p>}

        {rows.map((row, i) => (
          <div key={i} className="relative space-y-3 rounded-lg border border-border p-4">
            {!locked && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-variance-negative"
                aria-label="Remove plan"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="pr-6">
              {field(
                "Category",
                <input
                  value={row.category ?? ""}
                  onChange={(e) => update(i, "category", e.target.value)}
                  disabled={locked}
                  className={`${CELL} sm:max-w-xs`}
                  placeholder="e.g. Marketing"
                />,
              )}
            </div>
            {field(
              "Plan",
              <>
                <textarea
                  value={row.plan ?? ""}
                  onChange={(e) => update(i, "plan", e.target.value)}
                  disabled={locked}
                  rows={3}
                  className={`${CELL} resize-y`}
                  placeholder="Describe the plan…"
                />
                {!locked && (
                  <AiTextActions
                    value={row.plan ?? ""}
                    onResult={(t) => update(i, "plan", t)}
                    actions={["rewrite", "en", "id"]}
                    className="mt-1.5"
                  />
                )}
              </>,
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {field(
                "Subject",
                <input
                  value={row.remark ?? ""}
                  onChange={(e) => update(i, "remark", e.target.value)}
                  disabled={locked}
                  className={CELL}
                  placeholder="e.g. Meeting"
                />,
              )}
              {field(
                "Start",
                <input
                  value={row.startLabel ?? ""}
                  onChange={(e) => update(i, "startLabel", e.target.value)}
                  disabled={locked}
                  className={CELL}
                  placeholder="e.g. 02 Oct"
                />,
              )}
              {field(
                "Deadline",
                <input
                  value={row.deadlineLabel ?? ""}
                  onChange={(e) => update(i, "deadlineLabel", e.target.value)}
                  disabled={locked}
                  className={CELL}
                  placeholder="e.g. 08 Oct"
                />,
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
            onClick={() =>
              add({ category: "", plan: "", remark: "", startLabel: "", deadlineLabel: "" })
            }
          >
            <Plus /> Add plan
          </Button>
        )}
      </form>
    </SectionCardShell>
  );
}
