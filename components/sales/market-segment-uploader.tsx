"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  extractMarketSegmentAction,
  saveMarketSegmentAction,
} from "@/app/dashboard/[property]/[period]/rooms/segments/actions";
import type { ExtractedSegment } from "@/lib/sales/market-segment-logic";
import { cn } from "@/lib/utils";

const fmt = (n: number): string => (n ? Math.round(n).toLocaleString("en-US") : "—");

/** Editor panel: paste or screenshot the market-segment table → AI compiles → save. */
export function MarketSegmentUploader({
  property,
  period,
  scope,
  hasData,
}: {
  property: string;
  period: string;
  scope: "MTD" | "YTD";
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [segments, setSegments] = useState<ExtractedSegment[] | null>(null);
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      setImage({ base64, mediaType: file.type || "image/png", name: file.name });
    };
    reader.readAsDataURL(file);
  }

  function compile() {
    setMsg(null);
    setSegments(null);
    startBusy(async () => {
      const r = await extractMarketSegmentAction({
        property,
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
      });
      if (r.ok && r.segments) {
        setSegments(r.segments);
        setMsg({ ok: true, text: `Compiled ${r.segments.length} segment(s) — review, then save.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not compile." });
      }
    });
  }

  function save() {
    if (!segments) return;
    setMsg(null);
    startBusy(async () => {
      const r = await saveMarketSegmentAction({ property, period, scope, segments });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setSegments(null);
        setText("");
        setImage(null);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
      >
        Upload / compile with AI
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Compile Market Segment ({scope}) with AI</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the segment table (This Year / Budget / Last Year × Room Nights · ARR · Revenue) or attach a screenshot,
        then compile. Review the preview and save — it fills Market Segment Performance, Revenue by Segment and Room
        Nights Mix for {period} ({scope}).
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Paste the market segment table here…"
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => pickImage(e.target.files?.[0])}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {image ? `📎 ${image.name}` : "Attach screenshot"}
        </button>
        {image && (
          <button type="button" onClick={() => setImage(null)} className="text-xs text-variance-negative hover:underline">
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={compile}
          disabled={busy || (!text.trim() && !image)}
          className="ml-auto rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {busy ? "Working…" : "Compile with AI"}
        </button>
      </div>

      {msg && <p className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>}

      {segments && segments.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1.5">Segment</th>
                  <th className="px-2 py-1.5 text-right">TY RN</th>
                  <th className="px-2 py-1.5 text-right">TY Rev</th>
                  <th className="px-2 py-1.5 text-right">Bud RN</th>
                  <th className="px-2 py-1.5 text-right">Bud Rev</th>
                  <th className="px-2 py-1.5 text-right">LY RN</th>
                  <th className="px-2 py-1.5 text-right">LY Rev</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.segmentName} className="border-b border-border/60">
                    <td className="px-2 py-1.5 text-foreground">{s.segmentName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.actual.rn)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.actual.revenue)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.budget.rn)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.budget.revenue)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.lastYear?.rn ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.lastYear?.revenue ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
          >
            {busy ? "Saving…" : `Save ${segments.length} segment(s) for ${scope}`}
          </button>
        </div>
      )}
    </div>
  );
}
