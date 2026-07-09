"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NarrativeBlock } from "@/lib/dashboard-data";

/**
 * Renders a narrative section (read-only for now). The "Generate with AI" button
 * calls a stub endpoint and previews a draft — persistence + in-place editing
 * for admins land in Phase 13.
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
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, property, period }),
      });
      const data = (await res.json()) as { text?: string };
      setDraft(data.text ?? "No draft returned.");
    } catch {
      setDraft("Could not reach the AI service (stub).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {block?.aiGenerated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--brand-gold))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--brand-gold))]">
            <Sparkles className="h-3 w-3" /> AI-generated
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5"
          onClick={generate}
          disabled={loading}
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Generating…" : "Generate with AI"}
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

      {draft && (
        <div className="rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-[hsl(var(--brand-gold))]">
            AI draft preview — saving & in-place editing arrive in Phase 13
          </p>
          <p className="whitespace-pre-line text-muted-foreground">{draft}</p>
        </div>
      )}
    </div>
  );
}
