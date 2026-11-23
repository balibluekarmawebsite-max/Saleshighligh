"use client";

import { Sparkles } from "lucide-react";

import { AiDraftEditor } from "@/components/dashboard/ai-draft-editor";
import { Button } from "@/components/ui/button";
import { useNarrativeDraft } from "@/lib/ai/use-narrative-draft";
import type { NarrativeBlock } from "@/lib/dashboard-data";

/**
 * Render saved narrative text with light structure: a line that is just a short
 * "Label:" becomes a section heading; "- " lines become a bullet list; a
 * "Label: body" line bolds the label; everything else is a paragraph. Keeps the
 * AI's three-block acquisition format (and other sections) looking tidy.
 */
function FormattedNarrative({ content }: { content: string }) {
  const lines = content.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={key} className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-teal" />
            <span>{b}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flush(`u${idx}`);
      return;
    }
    const bullet = /^[-•*]\s+(.+)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1] ?? "");
      return;
    }
    flush(`u${idx}`);
    const headingOnly = /^([A-Za-z][\w &/]{1,40}):$/.exec(line);
    if (headingOnly) {
      out.push(
        <p key={idx} className="text-sm font-semibold text-foreground">
          {headingOnly[1]}
        </p>,
      );
      return;
    }
    const labelInline = /^([A-Za-z][\w &/]{1,40}):\s+(.+)$/.exec(line);
    if (labelInline) {
      out.push(
        <p key={idx} className="text-sm leading-relaxed text-foreground">
          <span className="font-semibold">{labelInline[1]}:</span> {labelInline[2]}
        </p>,
      );
      return;
    }
    out.push(
      <p key={idx} className="text-sm leading-relaxed text-foreground">
        {line}
      </p>,
    );
  });
  flush("uend");

  return <div className="space-y-2.5">{out}</div>;
}

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
        <FormattedNarrative content={block.content} />
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
