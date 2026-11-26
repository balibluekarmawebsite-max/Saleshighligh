"use client";

import type { ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SaveState } from "@/lib/ai/use-narrative-draft";

const DEFAULT_FOOTER =
  "Saving updates this period's narrative and keeps a version history; the preview above updates on save. Admin auth for editing lands in a later phase.";

/** Editable AI-draft buffer with Save / Discard, shared by the narrative panels. */
export function AiDraftEditor({
  draft,
  streaming,
  saveState,
  onChange,
  onSave,
  onDiscard,
  onRephrase,
  rephrasing = false,
  rows = 8,
  placeholder,
  footer = DEFAULT_FOOTER,
}: {
  draft: string | null;
  streaming: boolean;
  saveState: SaveState;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  /** When provided, shows a "Rephrase with AI" button that polishes the current draft. */
  onRephrase?: () => void;
  rephrasing?: boolean;
  rows?: number;
  placeholder?: string;
  footer?: ReactNode;
}) {
  if (draft == null) return null;
  const hasText = !!draft.trim();
  return (
    <div className="rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--brand-gold))]">
          <Sparkles className="h-3 w-3" /> Draft {streaming ? "· generating…" : "· edit, then save"}
        </p>
        <div className="flex items-center gap-2">
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-xs text-variance-positive">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {saveState === "error" && <span className="text-xs text-variance-negative">Save failed</span>}
          {onRephrase && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onRephrase}
              disabled={streaming || !hasText}
              title="Polish grammar and formatting with AI — keeps all your facts"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {rephrasing ? "Rephrasing…" : "Rephrase with AI"}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onDiscard} disabled={streaming}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={streaming || saveState === "saving" || !hasText}>
            {saveState === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        readOnly={streaming}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded border border-border bg-background p-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{footer}</p>
    </div>
  );
}
