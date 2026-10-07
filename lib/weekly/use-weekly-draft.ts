"use client";

import { useState } from "react";

import type { SaveState } from "@/lib/ai/use-narrative-draft";
import { saveWeeklyOverviewBlock } from "@/lib/weekly/editor-actions";

/**
 * Client hook powering the weekly Section A "Generate with AI" flow (Phase 7):
 * streams a draft of one overview block from /api/weekly/narrative into an
 * editable buffer, tracks whether a human has edited it (so the block is saved
 * as an AI draft only while untouched), and persists via a server action.
 */
export function useWeeklyDraft(property: string, week: string, block: string) {
  const [draft, setDraftState] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [edited, setEdited] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  async function generate() {
    setStreaming(true);
    setEdited(false);
    setSaveState("idle");
    setDraftState("");
    try {
      const res = await fetch("/api/weekly/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property, week, block }),
      });
      if (!res.ok || !res.body) {
        let message = "AI generation is unavailable.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* keep default */
        }
        setDraftState(message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setDraftState(acc);
      }
    } catch {
      setDraftState("Could not reach the AI service.");
    } finally {
      setStreaming(false);
    }
  }

  function setDraft(value: string) {
    setDraftState(value);
    setEdited(true);
    setSaveState("idle");
  }

  function discard() {
    setDraftState(null);
    setEdited(false);
    setSaveState("idle");
  }

  async function save() {
    if (draft == null || !draft.trim()) return;
    setSaveState("saving");
    try {
      const result = await saveWeeklyOverviewBlock({
        property,
        week,
        key: block,
        body: draft,
        aiGenerated: !edited,
      });
      setSaveState(result.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  return { draft, streaming, edited, saveState, generate, setDraft, discard, save };
}
