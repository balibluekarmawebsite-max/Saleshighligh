"use client";

import { useEffect } from "react";
import { Check, Sparkles } from "lucide-react";

import { FormattedNarrative } from "@/components/dashboard/narrative-panel";
import { Button } from "@/components/ui/button";
import { useNarrativeDraft } from "@/lib/ai/use-narrative-draft";
import type { NarrativeBlock } from "@/lib/dashboard-data";

/**
 * An always-editable overview text box with an AI assist. The box is seeded
 * with the saved narrative so it can be typed or pasted into directly; "Optimise
 * with AI" streams a refined version of the current text (grounded only in the
 * section's figures) back into the box, and an empty box generates one from
 * scratch. Save persists to the section's `NarrativeContent` (version history;
 * FINAL periods are locked). A live preview shows how the text will render.
 */
export function OverviewEditorPanel({
  block,
  section,
  property,
  period,
  placeholder = "Write the month's overview — headings like “Key Challenges:” and “- ” bullets render as structure.",
}: {
  block: NarrativeBlock | null;
  section: string;
  property: string;
  period: string;
  placeholder?: string;
}) {
  const { draft, streaming, saveState, generate, setDraft, seed, save } = useNarrativeDraft(section, property, period);

  // Seed the editable box from the saved content so it is always editable, and
  // re-seed whenever the saved content changes (e.g. after a successful save
  // revalidates the page). Only `block?.content` drives this, never `seed`
  // itself (a fresh closure each render would re-run it endlessly).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => seed(block?.content ?? ""), [block?.content]);

  const text = draft ?? "";
  const hasText = text.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {block?.aiGenerated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--brand-gold))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--brand-gold))]">
              <Sparkles className="h-3 w-3" /> AI-generated
            </span>
          )}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-xs text-variance-positive">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {saveState === "error" && <span className="text-xs text-variance-negative">Save failed</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => generate(text)}
            disabled={streaming}
            title="Rewrite your draft (or write one) from the figures above"
          >
            <Sparkles className="h-4 w-4" />
            {streaming ? "Optimising…" : hasText ? "Optimise with AI" : "Generate with AI"}
          </Button>
          <Button size="sm" onClick={save} disabled={streaming || saveState === "saving" || !hasText}>
            {saveState === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={streaming}
        rows={14}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="text-[11px] text-muted-foreground">
        Type the overview, or let AI optimise your draft — grounded only in the figures above. Saving keeps a version history; FINAL periods are locked.
      </p>

      {hasText && (
        <div className="rounded-md border border-border bg-secondary/30 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
          <FormattedNarrative content={text} />
        </div>
      )}
    </div>
  );
}
