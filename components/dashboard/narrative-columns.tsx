"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";

import { AiDraftEditor } from "@/components/dashboard/ai-draft-editor";
import { Button } from "@/components/ui/button";
import { useNarrativeDraft } from "@/lib/ai/use-narrative-draft";
import type { NarrativeBlock } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type Bucket = "good" | "improve" | "takeaways";

const EMOJI: { bucket: Bucket; re: RegExp }[] = [
  { bucket: "good", re: /^(?:😊|🙂|👍|✅)/ },
  { bucket: "improve", re: /^(?:☹️|🙁|😕|👎|⚠️|❌)/ },
  { bucket: "takeaways", re: /^(?:💡|➡️|📌|🎯)/ },
];

const LABEL: { bucket: Bucket; re: RegExp }[] = [
  { bucket: "good", re: /^(what'?s good|the good|good news|good|positives?|highlights?|wins?|strengths?)$/i },
  { bucket: "improve", re: /^(needs? improvement|areas? to improve|to improve|improvements?|weaknesses?|concerns?|challenges?|issues?)$/i },
  { bucket: "takeaways", re: /^(key takeaways?|takeaways?|action items?|actions?|next steps?|recommendations?|focus areas?|focus)$/i },
];

/** Split a free-text narrative into good / improve / takeaways buckets. */
function parseNarrative(content: string) {
  const good: string[] = [];
  const improve: string[] = [];
  const takeaways: string[] = [];
  const unstructured: string[] = [];
  const bucketOf: Record<Bucket, string[]> = { good, improve, takeaways };
  let current: Bucket | null = null;

  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const emoji = EMOJI.find((e) => e.re.test(trimmed));
    if (emoji) {
      current = emoji.bucket;
      const rest = trimmed.replace(emoji.re, "").replace(/^[\s:：\-–—]+/, "").trim();
      if (rest) bucketOf[current].push(rest);
      continue;
    }

    const line = trimmed.replace(/^[#>*\-•‣·]+\s*/, "").trim();
    const colonIdx = line.search(/[:：]/);
    if (colonIdx > 0 && colonIdx <= 24) {
      const label = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();
      const match = LABEL.find((l) => l.re.test(label));
      if (match) {
        current = match.bucket;
        if (rest) bucketOf[current].push(rest);
        continue;
      }
    }

    const bare = LABEL.find((l) => l.re.test(line));
    if (bare) {
      current = bare.bucket;
      continue;
    }

    if (current) bucketOf[current].push(line);
    else unstructured.push(line);
  }

  const structured = good.length + improve.length + takeaways.length > 0;
  return { good, improve, takeaways, unstructured, structured };
}

const COLUMNS: { bucket: Bucket; emoji: string; title: string; accent: string }[] = [
  { bucket: "good", emoji: "😊", title: "What's Good", accent: "border-variance-positive/40 bg-variance-positive/5" },
  { bucket: "improve", emoji: "☹️", title: "Needs Improvement", accent: "border-variance-negative/40 bg-variance-negative/5" },
  { bucket: "takeaways", emoji: "💡", title: "Key Takeaways", accent: "border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/5" },
];

function Column({ emoji, title, accent, items }: { emoji: string; title: string; accent: string; items: string[] }) {
  return (
    <div className={cn("rounded-lg border p-4", accent)}>
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span aria-hidden className="text-base">{emoji}</span>
        {title}
      </p>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-foreground">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

/**
 * Restaurant narrative rendered as three styled columns (😊 / ☹️ / 💡). Authors
 * split the content with emoji or "Good:" / "Needs improvement:" / "Takeaways:"
 * headers; unstructured text falls back to a single prose panel. The "Generate
 * with AI" button previews a draft from the stub endpoint.
 */
export function NarrativeColumns({
  block,
  section,
  property,
  period,
}: {
  block: NarrativeBlock | null;
  section: string;
  property: string;
  period: string;
}) {
  const { draft, streaming, saveState, generate, setDraft, discard, save } = useNarrativeDraft(section, property, period);

  const parsed = useMemo(
    () => (block?.content ? parseNarrative(block.content) : null),
    [block?.content],
  );

  return (
    <div className="space-y-4">
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

      {!block?.content ? (
        <p className="text-sm text-muted-foreground">
          No restaurant narrative written for this period yet.
        </p>
      ) : parsed && parsed.structured ? (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((c) => (
            <Column key={c.bucket} emoji={c.emoji} title={c.title} accent={c.accent} items={parsed[c.bucket]} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-2 text-sm leading-relaxed text-foreground">
            {block.content.split("\n").filter(Boolean).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: start lines with 😊, ☹️ or 💡 (or “Good:”, “Needs improvement:”, “Takeaways:”) to split this into columns.
          </p>
        </div>
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
