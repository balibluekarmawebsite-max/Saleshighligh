"use client";

import { Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SaveState } from "@/lib/ai/use-narrative-draft";

/** Editable AI-draft buffer with Save / Discard, shared by the narrative panels. */
export function AiDraftEditor({
  draft,
  streaming,
  saveState,
  onChange,
  onSave,
  onDiscard,
}: {
  draft: string | null;
  streaming: boolean;
  saveState: SaveState;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (draft == null) return null;
  return (
    <div className="rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--brand-gold))]">
          <Sparkles className="h-3 w-3" /> AI draft {streaming ? "· generating…" : "· edit, then save"}
        </p>
        <div className="flex items-center gap-2">
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-xs text-variance-positive">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {saveState === "error" && <span className="text-xs text-variance-negative">Save failed</span>}
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={streaming}>
            Discard
          </Button>
          <Button size="sm" onClick={onSave} disabled={streaming || saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        readOnly={streaming}
        rows={8}
        className="w-full resize-y rounded border border-border bg-background p-2 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Saving updates this period&apos;s narrative and keeps a version history; reload to see it applied. Admin auth for editing lands in a later phase.
      </p>
    </div>
  );
}
