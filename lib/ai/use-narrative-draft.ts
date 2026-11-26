"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Client hook powering the AI narrative panels (Phase 13): streams a draft from
 * /api/narrative into an editable buffer, tracks whether the human has edited it
 * (so `aiGenerated` is set correctly), and saves via /api/narrative/save.
 */
export function useNarrativeDraft(section: string, property: string, period: string) {
  const router = useRouter();
  const [draft, setDraftState] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [rephrasing, setRephrasing] = useState(false);
  const [edited, setEdited] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  /** POST to /api/narrative and stream the plain-text response into the buffer. */
  async function runStream(body: Record<string, unknown>) {
    setStreaming(true);
    setEdited(false);
    setSaveState("idle");
    setDraftState("");
    try {
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, property, period, ...body }),
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

  /** Generate a fresh draft from the section's KPI context. */
  async function generate() {
    await runStream({});
  }

  /** Rephrase the author's own text (polish grammar/format, keep every fact). */
  async function rephrase(input: string) {
    const t = (input ?? "").trim();
    if (!t) return;
    setRephrasing(true);
    try {
      await runStream({ mode: "rephrase", text: t });
    } finally {
      setRephrasing(false);
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
      if (res.ok) {
        // Re-fetch the server component so the saved text appears in the
        // read-only preview immediately, then collapse the draft editor — the
        // populated preview is now the source of truth (no manual reload).
        setSaveState("saved");
        router.refresh();
        discard();
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }

  return { draft, streaming, rephrasing, edited, saveState, generate, rephrase, setDraft, seed, discard, save };
}
