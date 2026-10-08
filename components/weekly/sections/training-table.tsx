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

/** Section I — training sessions run this week (topic has AI helpers). */
export function TrainingTable({
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

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="sectionId" value="trainings" />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title="I · Training" subtitle="Sessions run this week." />
          {!locked && <SaveButton state={state} />}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 align-top">Date</th>
                <th className="py-2 px-3 align-top">Topic</th>
                <th className="py-2 px-3 align-top">Duration</th>
                <th className="py-2 px-3 align-top">Trainer</th>
                <th className="py-2 px-3 align-top">Participants</th>
                <th className="w-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No trainings yet.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <input
                      value={row.dateLabel ?? ""}
                      onChange={(e) => update(i, "dateLabel", e.target.value)}
                      disabled={locked}
                      className={`${CELL} min-w-[7rem]`}
                      placeholder="Date"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      value={row.topic ?? ""}
                      onChange={(e) => update(i, "topic", e.target.value)}
                      disabled={locked}
                      className={`${CELL} min-w-[12rem]`}
                      placeholder="Topic"
                    />
                    {!locked && (
                      <AiTextActions
                        value={row.topic ?? ""}
                        onResult={(t) => update(i, "topic", t)}
                        actions={["rewrite", "en", "id"]}
                        className="mt-1.5"
                      />
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <input
                      value={row.duration ?? ""}
                      onChange={(e) => update(i, "duration", e.target.value)}
                      disabled={locked}
                      className={`${CELL} min-w-[5rem]`}
                      placeholder="30 min"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      value={row.trainer ?? ""}
                      onChange={(e) => update(i, "trainer", e.target.value)}
                      disabled={locked}
                      className={`${CELL} min-w-[8rem]`}
                      placeholder="Trainer"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      value={row.participants ?? ""}
                      onChange={(e) => update(i, "participants", e.target.value)}
                      disabled={locked}
                      className={`${CELL} min-w-[12rem]`}
                      placeholder="Participants"
                    />
                  </td>
                  <td className="py-2 text-right">
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="text-muted-foreground transition-colors hover:text-variance-negative"
                        aria-label="Remove training"
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() =>
                add({ dateLabel: "", topic: "", duration: "", trainer: "", participants: "" })
              }
            >
              <Plus /> Add training
            </Button>
          </div>
        )}
      </form>
    </SectionCardShell>
  );
}
