"use client";

import { CopyPlus, Sparkles } from "lucide-react";

import { AiDraftEditor } from "@/components/dashboard/ai-draft-editor";
import { Button } from "@/components/ui/button";
import { useNarrativeDraft } from "@/lib/ai/use-narrative-draft";
import type { PlanSectionBlocks } from "@/lib/dashboard-data";

/**
 * A content-managed plan section (Phase 13): renders the current narrative,
 * streams an AI draft into an editable buffer, and offers "Carry forward from
 * last month" (seeds the buffer from the previous period's content). Saving
 * writes back to the period and keeps a version history.
 */
export function PlanSectionPanel({
  blocks,
  section,
  property,
  period,
  emptyText = "Nothing written for this section yet.",
}: {
  blocks: PlanSectionBlocks;
  section: string;
  property: string;
  period: string;
  emptyText?: string;
}) {
  const { draft, streaming, saveState, generate, setDraft, seed, discard, save } = useNarrativeDraft(section, property, period);
  const { current, previous } = blocks;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {current?.aiGenerated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--brand-gold))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--brand-gold))]">
            <Sparkles className="h-3 w-3" /> AI-generated
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => previous?.content && seed(previous.content)}
            disabled={!previous?.content || streaming}
            title={previous?.content ? "Copy last month's content as a starting draft" : "No previous month to carry forward"}
          >
            <CopyPlus className="h-4 w-4" />
            Carry forward
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={generate} disabled={streaming}>
            <Sparkles className="h-4 w-4" />
            {streaming ? "Generating…" : "Generate with AI"}
          </Button>
        </div>
      </div>

      {current?.content ? (
        <div className="space-y-2 text-sm leading-relaxed text-foreground">
          {current.content.split("\n").filter(Boolean).map((p, i) => (
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
