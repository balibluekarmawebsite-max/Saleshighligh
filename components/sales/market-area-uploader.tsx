"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  extractMarketAreaAction,
  saveMarketAreaAction,
} from "@/app/dashboard/[property]/[period]/market/actions";
import { UploadControls, type UploadImage } from "@/components/sales/upload-controls";
import type { MarketAreaPoint } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

interface Row {
  month: string; // YYYY-MM
  propertyRoomNights: string;
  marketRoomNights: string;
  propertyAdr: string;
  marketAdr: string;
}

/** The n calendar months ending at `period` (inclusive), oldest first. */
function monthsEndingAt(period: string, n: number): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return [];
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(mo).padStart(2, "0")}`);
    mo -= 1;
    if (mo === 0) {
      mo = 12;
      y -= 1;
    }
  }
  return out;
}

const emptyRow = (month: string): Row => ({
  month,
  propertyRoomNights: "",
  marketRoomNights: "",
  propertyAdr: "",
  marketAdr: "",
});

function seedRows(initial: MarketAreaPoint[], period: string): Row[] {
  if (initial.length > 0) {
    return initial.map((p) => ({
      month: p.month,
      propertyRoomNights: String(p.propertyRoomNights),
      marketRoomNights: String(p.marketRoomNights),
      propertyAdr: String(p.propertyAdr),
      marketAdr: String(p.marketAdr),
    }));
  }
  return monthsEndingAt(period, 8).map(emptyRow);
}

const NUM_FIELDS: { key: keyof Row; label: string; hint: string }[] = [
  { key: "propertyRoomNights", label: "Room nights", hint: "e.g. 310" },
  { key: "marketRoomNights", label: "Room nights (Mkt)", hint: "e.g. 83" },
  { key: "propertyAdr", label: "ADR IDR", hint: "e.g. 3700000" },
  { key: "marketAdr", label: "ADR IDR (Mkt)", hint: "e.g. 2300000" },
];

export function MarketAreaUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: MarketAreaPoint[];
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [rows, setRows] = useState<Row[]>(() => seedRows(initial, period));
  const [text, setText] = useState("");
  const [image, setImage] = useState<UploadImage>(null);
  const [busyKind, setBusyKind] = useState<null | "compile" | "save">(null);
  const busy = busyKind !== null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCell = (i: number, key: keyof Row, value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow("")]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  function compile() {
    setMsg(null);
    setBusyKind("compile");
    void (async () => {
      try {
        const r = await extractMarketAreaAction({
          property,
          text: text.trim() || null,
          imageBase64: image?.base64 ?? null,
          imageMediaType: image?.mediaType ?? null,
        });
        if (r.ok && r.rows) {
          // Merge AI rows by month: update a matching row, else append.
          setRows((rs) => {
            const next = [...rs];
            for (const ar of r.rows!) {
              const month = String(ar.month ?? "");
              if (!month) continue;
              const idx = next.findIndex((x) => x.month === month);
              const merged: Row = {
                month,
                propertyRoomNights: String(ar.propertyRoomNights ?? ""),
                marketRoomNights: String(ar.marketRoomNights ?? ""),
                propertyAdr: String(ar.propertyAdr ?? ""),
                marketAdr: String(ar.marketAdr ?? ""),
              };
              if (idx >= 0) next[idx] = merged;
              else next.push(merged);
            }
            return next.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
          });
          setMsg({ ok: true, text: `Read ${r.rows.length} month(s) — review, then save.` });
        } else {
          setMsg({ ok: false, text: r.error ?? "Could not read that." });
        }
      } catch {
        setMsg({ ok: false, text: "Could not compile — please try again." });
      } finally {
        setBusyKind(null);
      }
    })();
  }

  function save() {
    setMsg(null);
    setBusyKind("save");
    void (async () => {
      try {
        const r = await saveMarketAreaAction({ property, period, rows });
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) {
          setOpen(false);
          router.refresh();
        }
      } finally {
        setBusyKind(null);
      }
    })();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10">
        {hasData ? "Edit / re-upload" : "Upload / compile with AI"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Market Area Update — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Attach the Booking.com &ldquo;Sales statistics&rdquo; chart (Room nights &amp; average daily rate, Monthly) or paste the
        figures, then compile — or type them in. Each month: the property&rsquo;s and the market&rsquo;s room nights and ADR (IDR).
      </p>

      <UploadControls
        compact
        placeholder="Paste the Booking.com monthly room nights &amp; ADR (property vs market)…"
        text={text}
        onText={setText}
        image={image}
        onImage={setImage}
        onCompile={compile}
        working={busyKind === "compile"}
        disabled={busy}
      />

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-2 py-1.5">Month (YYYY-MM)</th>
              {NUM_FIELDS.map((f) => (
                <th key={f.key} className="px-2 py-1.5 text-right">{f.label}</th>
              ))}
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="px-2 py-1.5">
                  <input value={r.month} onChange={(e) => setCell(i, "month", e.target.value)} placeholder="2026-10"
                    className="w-24 rounded-md border border-border bg-card px-2 py-1 text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                </td>
                {NUM_FIELDS.map((f) => (
                  <td key={f.key} className="px-2 py-1.5">
                    <input value={r[f.key]} onChange={(e) => setCell(i, f.key, e.target.value)} inputMode="numeric" placeholder={f.hint}
                      className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" onClick={() => removeRow(i)} className="text-xs text-muted-foreground hover:text-variance-negative">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50">
          + Add month
        </button>
        <button type="button" onClick={save} disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50">
          {busyKind === "save" ? "Saving…" : "Save Market Area Update"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
