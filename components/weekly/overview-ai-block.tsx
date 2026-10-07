"use client";

import { Sparkles } from "lucide-react";

import { AiDraftEditor } from "@/components/dashboard/ai-draft-editor";
import { Button } from "@/components/ui/button";
import { useWeeklyDraft } from "@/lib/weekly/use-weekly-draft";

/**
 * Per-block "Generate with AI" control for the weekly Section A overview. Lives
 * under each block's textarea: streams a grounded draft, lets the user edit it,
 * and saves it to that one block (marked as an AI draft until a human edits).
 */
export function OverviewAiBlock({
  property,
  week,
  blockKey,
}: {
  property: string;
  week: string;
  blockKey: string;
}) {
  const { draft, streaming, saveState, generate, setDraft, discard, save } = useWeeklyDraft(
    property,
    week,
    blockKey,
  );

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={generate}
        disabled={streaming}
        className="h-7 gap-1 border-[hsl(var(--brand-gold))]/40 px-2.5 text-[hsl(var(--brand-gold))] hover:bg-[hsl(var(--brand-gold))]/10 hover:text-[hsl(var(--brand-gold))]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {streaming ? "Generating…" : draft != null ? "Regenerate" : "Generate with AI"}
      </Button>
      <AiDraftEditor
        draft={draft}
        streaming={streaming}
        saveState={saveState}
        rows={5}
        onChange={setDraft}
        onSave={save}
        onDiscard={discard}
        footer="Grounded only in this week's imported figures. Saving stores this block (marked “AI draft” until you edit it) and logs it; reload to see it in the field above."
      />
    </div>
  );
}
