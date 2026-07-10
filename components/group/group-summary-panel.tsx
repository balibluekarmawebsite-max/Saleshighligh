"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * AI Group executive brief (Phase 15). Streams a grounded cross-property summary
 * from /api/narrative. Read-only — the Group has no period row to save into, so
 * this is a briefing aid, not persisted content.
 */
export function GroupSummaryPanel({ period }: { period: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  async function generate() {
    setStreaming(true);
    setDraft("");
    try {
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "GROUP_SUMMARY", property: "GROUP", period }),
      });
      if (!res.ok || !res.body) {
        let message = "AI generation is unavailable.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* keep default */
        }
        setDraft(message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setDraft(acc);
      }
    } catch {
      setDraft("Could not reach the AI service.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">A one-page executive brief comparing the three properties.</p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={generate} disabled={streaming}>
          <Sparkles className="h-4 w-4" />
          {streaming ? "Generating…" : "Generate with AI"}
        </Button>
      </div>
      {draft != null && (
        <div className="whitespace-pre-line rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-4 text-sm leading-relaxed text-foreground">
          {draft || "…"}
        </div>
      )}
    </div>
  );
}
