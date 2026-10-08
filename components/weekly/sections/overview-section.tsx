"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Loader2, Sparkles, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiTextActions } from "@/components/weekly/ai-text-actions";
import { saveOverview } from "@/lib/weekly/editor-actions";
import { type WeeklyEditorBlock } from "@/lib/weekly/editor-data";
import {
  CELL,
  SaveButton,
  SectionCardShell,
  SectionHeading,
} from "@/components/weekly/sections/shared";

async function streamInto(
  url: string,
  body: unknown,
  onChunk: (text: string) => void,
): Promise<void> {
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

/** Section A — the 7 Sales & Marketing Overview blocks, each with AI helpers. */
export function OverviewSection({
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
  const [anom, setAnom] = useState<string | null>(null);
  const [anomBusy, setAnomBusy] = useState(false);
  const [state, formAction] = useFormState(saveOverview, null);

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

  async function checkAnomalies() {
    if (anomBusy) return;
    setAnomBusy(true);
    setAnom("");
    try {
      await streamInto("/api/weekly/ai/text", { mode: "anomalies", property, week }, setAnom);
    } finally {
      setAnomBusy(false);
    }
  }

  return (
    <SectionCardShell>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title="A · Sales & Marketing Overview"
            subtitle="Seven narrative blocks. Draft, rewrite or translate each with AI, then save."
          />
          <div className="flex items-center gap-2">
            {!locked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={checkAnomalies}
                disabled={anomBusy}
                className="gap-1"
              >
                {anomBusy ? <Loader2 className="animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Check anomalies
              </Button>
            )}
            {!locked && <SaveButton state={state} />}
          </div>
        </div>

        {anom !== null && (
          <div className="rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-3 text-sm">
            <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--brand-gold))]">
              <ShieldAlert className="h-3.5 w-3.5" /> Anomaly check {anomBusy ? "· reviewing…" : ""}
            </p>
            <div className="whitespace-pre-wrap leading-relaxed text-foreground">{anom || "…"}</div>
          </div>
        )}

        {blocks.map((b) => (
          <div key={b.key} className="space-y-1.5">
            <label
              htmlFor={`block_${b.key}`}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              {b.heading}
              {b.aiDraft && b.body && (
                <span className="rounded-full bg-[hsl(var(--brand-gold))]/15 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--brand-gold))]">
                  AI draft
                </span>
              )}
            </label>
            <textarea
              id={`block_${b.key}`}
              name={`block_${b.key}`}
              value={bodies[b.key] ?? ""}
              onChange={(e) => setBody(b.key, e.target.value)}
              disabled={locked}
              readOnly={drafting === b.key}
              rows={3}
              placeholder={locked ? "" : "Write this section…"}
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
                    {drafting === b.key ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-3 w-3" aria-hidden />
                    )}
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
