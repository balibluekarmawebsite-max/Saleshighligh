"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  extractRestaurantSourcesAction,
  saveRestaurantSourcesAction,
} from "@/app/dashboard/[property]/[period]/restaurant/actions";
import type { SourceRow } from "@/lib/dashboard-data";
import { normalizeSourceRows, toInt, toNum, sourceTotals } from "@/lib/sales/restaurant-sources-logic";
import { formatIDR, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  sourceName: string;
  persons: string;
  revenue: string;
}

const blankRow = (): Row => ({ sourceName: "", persons: "", revenue: "" });

const fromInitial = (initial: SourceRow[]): Row[] => {
  if (initial.length === 0) return [blankRow(), blankRow(), blankRow()];
  return initial.map((s) => ({ sourceName: s.sourceName, persons: String(s.persons), revenue: String(s.revenue) }));
};

/** Parse a row's persons + revenue for the live derived preview (null when blank). */
function parsed(r: Row): { persons: number; revenue: number } | null {
  const persons = toInt(r.persons);
  const revenue = toNum(r.revenue);
  if (!r.sourceName.trim() || persons == null || revenue == null) return null;
  return { persons: Math.max(0, persons), revenue: Math.max(0, revenue) };
}

export function RestaurantSourcesUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: SourceRow[];
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [rows, setRows] = useState<Row[]>(() => fromInitial(initial));
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Live derived preview that matches exactly what will be stored: run the grid
  // through the SAME normalization as save (drops TOTAL/blank rows, de-dupes by
  // name) so the TOTAL and the % denominator never overstate the saved result.
  const totals = sourceTotals(normalizeSourceRows(rows).rows);

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

  function setCell(i: number, field: keyof Row, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length <= 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i)));
  }

  function compile() {
    setMsg(null);
    startBusy(async () => {
      const r = await extractRestaurantSourcesAction({
        property,
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
      });
      if (r.ok && r.sources) {
        setRows(
          r.sources.length > 0
            ? r.sources.map((s) => ({ sourceName: s.sourceName, persons: String(s.persons), revenue: String(s.revenue) }))
            : [blankRow()],
        );
        setMsg({ ok: true, text: `Read ${r.sources.length} source(s) — review the table below, then save.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not read the table." });
      }
    });
  }

  function save() {
    const sources = rows
      .filter((r) => r.sourceName.trim() !== "" && r.persons.trim() !== "" && r.revenue.trim() !== "")
      .map((r) => ({ sourceName: r.sourceName, persons: r.persons, revenue: r.revenue }));
    if (sources.length === 0) {
      setMsg({ ok: false, text: "Enter at least one source with persons and revenue." });
      return;
    }
    setMsg(null);
    startBusy(async () => {
      const r = await saveRestaurantSourcesAction({ property, period, sources });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
      >
        {hasData ? "Edit / re-upload" : "Upload / compile with AI"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Source of Booking — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the SOB table or attach a screenshot/file, then compile with AI — or type the sources straight into the
        grid. Only the source name, persons and revenue are stored; the %, average check and TOTAL are computed.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the source-of-booking rows (name, persons, revenue)…"
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickImage(e.target.files?.[0]);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          {image ? `📎 ${image.name}` : "Attach screenshot / file"}
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

      {/* Editable grid with a live derived preview (%, avg check, TOTAL). */}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-2 py-1.5">Source</th>
              <th className="px-2 py-1.5 text-right">Persons</th>
              <th className="px-2 py-1.5 text-right">Revenue</th>
              <th className="px-2 py-1.5 text-right">%</th>
              <th className="px-2 py-1.5 text-right">Avg Check</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = parsed(r);
              const pct = p && totals.persons > 0 ? (p.persons / totals.persons) * 100 : null;
              const avg = p && p.persons > 0 ? p.revenue / p.persons : null;
              return (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-2 py-1.5">
                    <input
                      value={r.sourceName}
                      onChange={(e) => setCell(i, "sourceName", e.target.value)}
                      placeholder="e.g. Breakfast in House"
                      className="w-44 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.persons}
                      onChange={(e) => setCell(i, "persons", e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.revenue}
                      onChange={(e) => setCell(i, "revenue", e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-32 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{pct !== null ? formatPercent(pct) : "—"}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{avg !== null ? formatIDR(avg) : "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" onClick={() => removeRow(i)} className="text-xs text-variance-negative hover:underline" aria-label="Remove source">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border text-xs font-semibold text-foreground">
              <td className="px-2 py-1.5">TOTAL</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(totals.persons)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatIDR(totals.revenue)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.persons > 0 ? formatPercent(100) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.avgCheck !== null ? formatIDR(totals.avgCheck) : "—"}</td>
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          + Add source
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save source of booking"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
