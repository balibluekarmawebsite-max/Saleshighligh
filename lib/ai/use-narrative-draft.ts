"use client";

import { useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Client hook powering the AI narrative panels (Phase 13): streams a draft from
 * /api/narrative into an editable buffer, tracks whether the human has edited it
 * (so `aiGenerated` is set correctly), and saves via /api/narrative/save.
 */
export function useNarrativeDraft(section: string, property: string, period: string) {
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
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, property, period }),
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

  /** Seed the editable buffer from existing content (e.g. carry-forward). */
  function seed(value: string) {
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
      const res = await fetch("/api/narrative/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, property, period, content: draft, aiGenerated: !edited }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  return { draft, streaming, edited, saveState, generate, setDraft, seed, discard, save };
}
