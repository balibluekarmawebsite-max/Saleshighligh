"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export type AiAction = "rewrite" | "shorten" | "id" | "en";

const ACTION_MODE: Record<AiAction, string> = {
  rewrite: "rewrite",
  shorten: "shorten",
  id: "translate_id",
  en: "translate_en",
};

const ACTION_LABEL: Record<AiAction, string> = {
  rewrite: "Rewrite",
  shorten: "Shorten",
  id: "→ ID",
  en: "→ EN",
};

/**
 * Inline AI helpers for a single text field: Rewrite / Shorten / → ID / → EN.
 * Streams the transformed text from /api/weekly/ai/text and feeds it back
 * through `onResult` so the caller can update its field state live.
 */
export function AiTextActions({
  value,
  onResult,
  disabled = false,
  actions = ["rewrite", "shorten", "id", "en"],
  className,
  leading,
}: {
  value: string;
  onResult: (text: string) => void;
  disabled?: boolean;
  actions?: AiAction[];
  className?: string;
  /** Optional control rendered right after the sparkle (e.g. a "Draft with AI" button). */
  leading?: React.ReactNode;
}) {
  const [busy, setBusy] = useState<AiAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: AiAction) {
    if (busy) return;
    if (!value.trim()) {
      setError("Write something first.");
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/weekly/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: ACTION_MODE[action], text: value }),
      });
      if (!res.ok || !res.body) {
        let message = "AI is unavailable.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* keep default */
        }
        setError(message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        acc += decoder.decode(chunk, { stream: true });
        onResult(acc);
      }
    } catch {
      setError("Could not reach the AI service.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--brand-gold))]" aria-hidden />
      {leading}
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => run(a)}
          disabled={disabled || busy !== null}
          className={cn(
            "inline-flex items-center gap-1 font-medium text-primary transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {busy === a && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          {ACTION_LABEL[a]}
        </button>
      ))}
      {error && <span className="text-variance-negative">{error}</span>}
    </div>
  );
}
