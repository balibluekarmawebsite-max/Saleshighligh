"use client";

import { useState } from "react";
import { CopyPlus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlanSectionBlocks } from "@/lib/dashboard-data";

/**
 * A content-managed plan section: renders the current narrative, offers an AI
 * draft (stub) and a "Carry forward from last month" action that seeds a draft
 * from the previous period's content. Persisted edit-in-place + rich-text land
 * with the admin/auth phase, so drafts here are previews only.
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
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const { current, previous } = blocks;

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
      setDraftLabel("AI draft preview");
    } catch {
      setDraft("Could not reach the AI service (stub).");
      setDraftLabel("AI draft preview");
    } finally {
      setLoading(false);
    }
  }

  function carryForward() {
    if (previous?.content) {
      setDraft(previous.content);
      setDraftLabel("Carried forward from last month");
    }
  }

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
            onClick={carryForward}
            disabled={!previous?.content}
            title={previous?.content ? "Copy last month's content as a starting draft" : "No previous month to carry forward"}
          >
            <CopyPlus className="h-4 w-4" />
            Carry forward
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={generate} disabled={loading}>
            <Sparkles className="h-4 w-4" />
            {loading ? "Generating…" : "Generate with AI"}
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

      {draft && (
        <div className="rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-[hsl(var(--brand-gold))]">
            {draftLabel} — saving &amp; in-place editing arrive in a later phase
          </p>
          <p className="whitespace-pre-line text-muted-foreground">{draft}</p>
        </div>
      )}
    </div>
  );
}
