"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  extractSpaTreatmentsAction,
  saveSpaTreatmentsAction,
} from "@/app/dashboard/[property]/[period]/spa/actions";
import type { SpaTreatmentRow } from "@/lib/dashboard-data";
import { toInt, toNum } from "@/lib/sales/restaurant-sources-logic";
import { normalizeTreatmentRows, treatmentTotals } from "@/lib/sales/spa-treatments-logic";
import { formatIDR, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  treatmentName: string;
  count: string;
  revenue: string;
}

const blankRow = (): Row => ({ treatmentName: "", count: "", revenue: "" });

function fromInitial(initial: SpaTreatmentRow[]): Row[] {
  if (initial.length === 0) return [blankRow(), blankRow(), blankRow()];
  return initial.map((t) => ({ treatmentName: t.treatmentName, count: String(t.count), revenue: String(t.revenue) }));
}

/** Map the string grid to raw rows for normalize / save / live preview. */
function gridToRaw(rows: Row[]) {
  return rows.map((r) => ({ treatmentName: r.treatmentName, count: r.count, revenue: r.revenue }));
}

export function SpaTreatmentsUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: SpaTreatmentRow[];
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

  // Live totals, run through the SAME normalization as save so the TOTAL and the
  // % denominator never overstate the saved result.
  const totals = treatmentTotals(normalizeTreatmentRows(gridToRaw(rows)).rows);

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
      const r = await extractSpaTreatmentsAction({
        property,
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
      });
      if (r.ok && r.treatments) {
        setRows(
          r.treatments.length > 0
            ? r.treatments.map((t) => ({ treatmentName: t.treatmentName, count: String(t.count), revenue: String(t.revenue) }))
            : [blankRow()],
        );
        setMsg({ ok: true, text: `Read ${r.treatments.length} treatment(s) — review the table below, then save.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not read the table." });
      }
    });
  }

  function save() {
    const treatments = gridToRaw(rows);
    if (normalizeTreatmentRows(treatments).rows.length === 0) {
      setMsg({ ok: false, text: "Enter at least one treatment with a count and revenue." });
      return;
    }
    setMsg(null);
    startBusy(async () => {
      const r = await saveSpaTreatmentsAction({ property, period, treatments });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        // Processed: collapse to the toggle button; the refreshed table shows it.
        setOpen(false);
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
        {hasData ? "Edit / re-upload" : "Upload / compile with AI"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Top Treatments — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the treatments table or attach a screenshot/file, then compile with AI — or type the rows straight into the
        grid. Only the treatment name, person count and revenue are stored; the %, average check and TOTAL are computed.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the treatment rows (name, person, revenue)…"
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
              <th className="px-2 py-1.5">Treatment</th>
              <th className="px-2 py-1.5 text-right">Person</th>
              <th className="px-2 py-1.5 text-right">Revenue</th>
              <th className="px-2 py-1.5 text-right">%</th>
              <th className="px-2 py-1.5 text-right">Avg Check</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const count = Math.max(0, toInt(r.count) ?? 0);
              const revenue = Math.max(0, toNum(r.revenue) ?? 0);
              const named = r.treatmentName.trim() !== "" && r.count.trim() !== "" && r.revenue.trim() !== "";
              const pct = named && totals.count > 0 ? (count / totals.count) * 100 : null;
              const avg = named && count > 0 ? revenue / count : null;
              return (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-2 py-1.5">
                    <input
                      value={r.treatmentName}
                      onChange={(e) => setCell(i, "treatmentName", e.target.value)}
                      placeholder="e.g. Balinese Massage"
                      className="w-56 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.count}
                      onChange={(e) => setCell(i, "count", e.target.value)}
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
                    <button type="button" onClick={() => removeRow(i)} className="text-xs text-variance-negative hover:underline" aria-label="Remove treatment">
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
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(totals.count)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatIDR(totals.revenue)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.count > 0 ? formatPercent(100) : "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{totals.avgCheck !== null ? formatIDR(totals.avgCheck) : "—"}</td>
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          + Add treatment
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save treatments"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
