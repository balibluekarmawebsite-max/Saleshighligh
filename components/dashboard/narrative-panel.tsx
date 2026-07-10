"use client";

import { Sparkles } from "lucide-react";

import { AiDraftEditor } from "@/components/dashboard/ai-draft-editor";
import { Button } from "@/components/ui/button";
import { useNarrativeDraft } from "@/lib/ai/use-narrative-draft";
import type { NarrativeBlock } from "@/lib/dashboard-data";

/**
 * Renders a narrative section (read-only display of the saved content) with an
 * AI draft workflow: "Generate with AI" streams a grounded draft into an
 * editable buffer that can be saved back to the period (Phase 13).
 */
export function NarrativePanel({
  block,
  section,
  property,
  period,
  emptyText = "No executive summary written for this period yet.",
}: {
  block: NarrativeBlock | null;
  section: string;
  property: string;
  period: string;
  emptyText?: string;
}) {
  const { draft, streaming, saveState, generate, setDraft, discard, save } = useNarrativeDraft(section, property, period);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {block?.aiGenerated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--brand-gold))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--brand-gold))]">
            <Sparkles className="h-3 w-3" /> AI-generated
          </span>
        )}
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={generate} disabled={streaming}>
          <Sparkles className="h-4 w-4" />
          {streaming ? "Generating…" : "Generate with AI"}
        </Button>
      </div>

      {block?.content ? (
        <div className="space-y-2 text-sm leading-relaxed text-foreground">
          {block.content.split("\n").filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}

      <AiDraftEditor
        draft={draft}
        streaming={streaming}
        saveState={saveState}
        onChange={setDraft}
        onSave={save}
        onDiscard={discard}
      />
    </div>
  );
}
