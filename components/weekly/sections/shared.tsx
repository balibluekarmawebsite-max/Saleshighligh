"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { formatWeeklyPercent } from "@/lib/weekly/format";
import type { ActionResult } from "@/lib/weekly/editor-actions";

export type Row = Record<string, string>;

/**
 * Local editable row state that re-seeds when the server sends fresh props
 * (after a save + revalidate), so a saved grid reflects persisted state
 * instead of going stale — the same pattern the ads editor uses.
 */
export function useRows(initial: Row[]) {
  const [rows, setRows] = useState<Row[]>(initial);
  const sig = JSON.stringify(initial);
  useEffect(() => {
    setRows(JSON.parse(sig) as Row[]);
  }, [sig]);

  const update = (i: number, key: string, val: string) =>
    setRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, [key]: val } : r)));
  const add = (blank: Row) => setRows((rs) => [...rs, blank]);
  const remove = (i: number) => setRows((rs) => rs.filter((_, ri) => ri !== i));

  return { rows, setRows, update, add, remove };
}

/** Shared input style for grid / card cells. */
export const CELL =
  "w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

/** Parse a user-typed number cell (strips commas, spaces, % signs). */
export function toNum(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = s.toString().trim().replace(/[,\s%]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Sum a numeric column across rows (missing/invalid → 0). */
export function sumCol(rows: Record<string, string>[], key: string): number {
  return rows.reduce((s, r) => s + (toNum(r[key]) ?? 0), 0);
}

export const dispNum = (n: number | null | undefined) =>
  n == null ? "—" : formatNumber(n);
export const dispPct = (n: number | null | undefined) =>
  n == null ? "—" : formatWeeklyPercent(n);

/** Section title + subtitle in the editor's display-serif style. */
export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="font-serif text-xl font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** The Save button + inline save status, placed in a section header (inside the form). */
export function SaveButton({ state }: { state: ActionResult | null }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-2">
      {state?.ok && (
        <span className="flex items-center gap-1 text-xs text-variance-positive">
          <Check className="h-3.5 w-3.5" /> {state.message}
        </span>
      )}
      {state && !state.ok && (
        <span className="max-w-[16rem] text-xs text-variance-negative">{state.message}</span>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

/** The outer section card (white panel, rounded, bordered) used by every editor. */
export function SectionCardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">{children}</div>
  );
}
