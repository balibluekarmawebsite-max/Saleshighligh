"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveOverview } from "@/lib/weekly/editor-actions";
import { type WeeklyEditorBlock } from "@/lib/weekly/editor-data";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Saving…" : "Save overview"}
    </Button>
  );
}

/** Editable Section A overview — the 7 narrative blocks, saved in one go. */
export function OverviewEditor({
  property,
  week,
  blocks,
  locked,
}: {
  property: string;
  week: string;
  blocks: WeeklyEditorBlock[];
  locked: boolean;
}) {
  const [state, formAction] = useFormState(saveOverview, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="week" value={week} />

      {blocks.map((b) => (
        <div key={b.key} className="space-y-1.5">
          <label
            htmlFor={`block_${b.key}`}
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            {b.heading}
            {b.aiDraft && b.body && (
              <span className="rounded-full bg-[hsl(var(--brand-gold))]/15 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--brand-gold))]">
                AI draft
              </span>
            )}
          </label>
          <textarea
            id={`block_${b.key}`}
            name={`block_${b.key}`}
            defaultValue={b.body}
            disabled={locked}
            rows={3}
            placeholder={locked ? "" : "Write this section…"}
            className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      ))}

      {!locked && (
        <div className="flex items-center gap-3">
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
