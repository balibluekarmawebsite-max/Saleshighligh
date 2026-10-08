"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";

import { AiTextActions } from "@/components/weekly/ai-text-actions";
import { saveSocialNarrative } from "@/lib/weekly/editor-actions";
import { type WeeklyEditorBlock } from "@/lib/weekly/editor-data";
import {
  CELL,
  SaveButton,
  SectionCardShell,
  SectionHeading,
} from "@/components/weekly/sections/shared";
import { cn } from "@/lib/utils";

const CHIP: Record<string, string> = {
  sm_highlights: "bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))]",
  sm_strength: "bg-variance-positive/10 text-variance-positive",
  sm_weakness: "bg-variance-negative/10 text-variance-negative",
};

async function streamInto(url: string, body: unknown, onChunk: (text: string) => void): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let message = "AI is unavailable.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep default */
    }
    onChunk(message);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    onChunk(acc);
  }
}

/** Section H — Overall Highlights / Strength / Weakness narrative with AI. */
export function SocialNarrative({
  property,
  week,
  locked,
  blocks,
}: {
  property: string;
  week: string;
  locked: boolean;
  blocks: WeeklyEditorBlock[];
}) {
  const seed = () => Object.fromEntries(blocks.map((b) => [b.key, b.body]));
  const [bodies, setBodies] = useState<Record<string, string>>(seed);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [state, formAction] = useFormState(saveSocialNarrative, null);

  const sig = JSON.stringify(blocks.map((b) => [b.key, b.body]));
  useEffect(() => {
    setBodies(Object.fromEntries((JSON.parse(sig) as [string, string][]).map(([k, v]) => [k, v])));
  }, [sig]);

  const setBody = (key: string, val: string) => setBodies((b) => ({ ...b, [key]: val }));

  async function draft(key: string) {
    if (drafting) return;
    setDrafting(key);
    try {
      await streamInto("/api/weekly/narrative", { property, week, block: key }, (t) => setBody(key, t));
    } finally {
      setDrafting(null);
    }
  }

  return (
    <SectionCardShell>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title="Social Media Insight — Summary"
            subtitle="Overall Highlights, Strength and Weakness. Draft each with AI from this week's metrics, then save."
          />
          {!locked && <SaveButton state={state} />}
        </div>

        {blocks.map((b) => (
          <div key={b.key} className="space-y-1.5">
            <span
              className={cn(
                "inline-block rounded px-2 py-0.5 text-xs font-semibold",
                CHIP[b.key] ?? "bg-secondary text-secondary-foreground",
              )}
            >
              {b.heading}
            </span>
            <textarea
              id={`block_${b.key}`}
              name={`block_${b.key}`}
              value={bodies[b.key] ?? ""}
              onChange={(e) => setBody(b.key, e.target.value)}
              disabled={locked}
              readOnly={drafting === b.key}
              rows={2}
              placeholder={locked ? "" : "Write this note…"}
              className={`${CELL} resize-y`}
            />
            {!locked && (
              <AiTextActions
                value={bodies[b.key] ?? ""}
                onResult={(t) => setBody(b.key, t)}
                disabled={drafting === b.key}
                leading={
                  <button
                    type="button"
                    onClick={() => draft(b.key)}
                    disabled={drafting !== null}
                    className="inline-flex items-center gap-1 font-medium text-[hsl(var(--brand-gold))] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {drafting === b.key ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
                    Draft with AI
                  </button>
                }
              />
            )}
          </div>
        ))}
      </form>
    </SectionCardShell>
  );
}
