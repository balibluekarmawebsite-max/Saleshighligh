"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteWeeklyScreenshot,
  saveWeeklyScreenshot,
  uploadWeeklyScreenshot,
} from "@/lib/weekly/screenshot-actions";
import { type WeeklyScreenshotRow } from "@/lib/weekly/screenshot-data";
import { SCREENSHOT_CATEGORIES } from "@/lib/weekly/screenshots";

type SaveState = "idle" | "saving" | "saved" | "error";

function ScreenshotCard({ shot, locked }: { shot: WeeklyScreenshotRow; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(shot.title ?? "");
  const [category, setCategory] = useState(shot.category);
  const [summary, setSummary] = useState(shot.summary ?? "");
  const [fromAi, setFromAi] = useState(shot.aiGenerated);
  const [edited, setEdited] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  async function generate() {
    setAiError(null);
    setStreaming(true);
    try {
      const res = await fetch("/api/weekly/screenshot/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shot.id }),
      });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setAiError(d.error ?? "AI generation is unavailable.");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setSummary(acc);
      }
      setFromAi(true);
      setEdited(false);
      setSaveState("idle");
    } catch {
      setAiError("Could not reach the AI service.");
    } finally {
      setStreaming(false);
    }
  }

  function save() {
    setSaveState("saving");
    startTransition(async () => {
      const r = await saveWeeklyScreenshot({
        id: shot.id,
        title,
        summary,
        category,
        aiGenerated: fromAi && !edited,
      });
      setSaveState(r.ok ? "saved" : "error");
    });
  }

  function remove() {
    if (!window.confirm("Delete this screenshot?")) return;
    startTransition(async () => {
      const r = await deleteWeeklyScreenshot(shot.id);
      if (r.ok) router.refresh();
      else setSaveState("error");
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[200px_1fr]">
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.imageUrl}
          alt={title || "screenshot"}
          className="w-full rounded-md border border-border object-contain"
        />
        {!locked && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-full rounded-md border border-border bg-card px-2 text-xs text-foreground"
          >
            {SCREENSHOT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        {!locked && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            Summary
            {fromAi && !edited && summary && (
              <span className="rounded-full bg-[hsl(var(--brand-gold))]/15 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--brand-gold))]">AI</span>
            )}
          </label>
          {!locked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generate}
              disabled={streaming}
              className="h-7 gap-1 border-[hsl(var(--brand-gold))]/40 px-2.5 text-[hsl(var(--brand-gold))] hover:bg-[hsl(var(--brand-gold))]/10 hover:text-[hsl(var(--brand-gold))]"
            >
              {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {streaming ? "Reading…" : summary ? "Regenerate" : "Summarise with AI"}
            </Button>
          )}
        </div>
        <textarea
          value={summary}
          onChange={(e) => { setSummary(e.target.value); setEdited(true); setSaveState("idle"); }}
          readOnly={locked || streaming}
          rows={4}
          placeholder={locked ? "" : "Write a short summary, or let AI read the screenshot…"}
          className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
        {aiError && <p className="text-xs text-variance-negative">{aiError}</p>}
        {!locked && (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={save} disabled={pending || streaming}>
              {saveState === "saving" ? "Saving…" : "Save"}
            </Button>
            {saveState === "saved" && (
              <span className="flex items-center gap-1 text-xs text-variance-positive"><Check className="h-3.5 w-3.5" /> Saved</span>
            )}
            {saveState === "error" && <span className="text-xs text-variance-negative">Failed</span>}
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending} className="ml-auto text-muted-foreground hover:text-variance-negative">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Upload + manage the weekly SM screenshots (Booking.com, Instagram, …) with AI summaries. */
export function ScreenshotManager({
  property,
  week,
  locked,
  screenshots,
}: {
  property: string;
  week: string;
  locked: boolean;
  screenshots: WeeklyScreenshotRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>("booking_com");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onUpload() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose an image first."); return; }
    const fd = new FormData();
    fd.set("property", property);
    fd.set("week", week);
    fd.set("category", category);
    fd.set("title", title);
    fd.set("file", file);
    startTransition(async () => {
      const r = await uploadWeeklyScreenshot(fd);
      if (!r.ok) { setError(r.message ?? "Upload failed."); return; }
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!locked && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
            >
              {SCREENSHOT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-muted-foreground">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Last 30 days"
              className="h-9 w-48 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <Button type="button" size="sm" onClick={onUpload} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-variance-negative">{error}</p>}

      {screenshots.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {locked ? "No screenshots for this week." : "No screenshots yet — upload a Booking.com or social screenshot above, then let AI summarise it."}
        </p>
      ) : (
        <div className="space-y-3">
          {screenshots.map((s) => (
            <ScreenshotCard key={s.id} shot={s} locked={locked} />
          ))}
        </div>
      )}
    </div>
  );
}
