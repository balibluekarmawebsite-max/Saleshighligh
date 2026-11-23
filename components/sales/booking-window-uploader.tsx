"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  extractBookingWindowAction,
  saveBookingWindowAction,
} from "@/app/dashboard/[property]/[period]/market/actions";
import { UploadControls, type UploadImage } from "@/components/sales/upload-controls";
import type { BookingWindowData } from "@/lib/dashboard-data";
import { BOOKING_WINDOW_BUCKETS, canonicalBucket } from "@/lib/sales/booking-window-logic";
import { cn } from "@/lib/utils";

interface Row {
  bucket: string;
  propertyShare: string;
  marketShare: string;
  propertyAdr: string;
  marketAdr: string;
}

const NUM_FIELDS: { key: keyof Row; label: string; hint: string }[] = [
  { key: "propertyShare", label: "My share %", hint: "e.g. 18" },
  { key: "marketShare", label: "Market share %", hint: "e.g. 26" },
  { key: "propertyAdr", label: "My ADR IDR", hint: "e.g. 3000000" },
  { key: "marketAdr", label: "Market ADR IDR", hint: "e.g. 1500000" },
];

function seedRows(initial: BookingWindowData | null): Row[] {
  const byBucket = new Map((initial?.buckets ?? []).map((b) => [b.bucket, b]));
  return BOOKING_WINDOW_BUCKETS.map((bucket) => {
    const b = byBucket.get(bucket);
    return {
      bucket,
      propertyShare: b ? String(b.propertySharePct) : "",
      marketShare: b ? String(b.marketSharePct) : "",
      propertyAdr: b ? String(b.propertyAdr) : "",
      marketAdr: b ? String(b.marketAdr) : "",
    };
  });
}

export function BookingWindowUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: BookingWindowData | null;
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [windowLabel, setWindowLabel] = useState(initial?.windowLabel ?? "Last 90 days");
  const [dataAsOf, setDataAsOf] = useState(initial?.dataAsOf ?? "");
  const [totalBooked, setTotalBooked] = useState(initial ? String(initial.totalBookedRooms) : "");
  const [rows, setRows] = useState<Row[]>(() => seedRows(initial));
  const [text, setText] = useState("");
  const [image, setImage] = useState<UploadImage>(null);
  const [busyKind, setBusyKind] = useState<null | "compile" | "save">(null);
  const busy = busyKind !== null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCell = (i: number, key: keyof Row, value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  function compile() {
    setMsg(null);
    setBusyKind("compile");
    void (async () => {
      try {
        const r = await extractBookingWindowAction({
          property,
          text: text.trim() || null,
          imageBase64: image?.base64 ?? null,
          imageMediaType: image?.mediaType ?? null,
        });
        if (r.ok && r.rows) {
          if (r.meta) {
            if (r.meta.windowLabel) setWindowLabel(r.meta.windowLabel);
            if (r.meta.dataAsOf) setDataAsOf(r.meta.dataAsOf);
            if (r.meta.totalBookedRooms) setTotalBooked(String(r.meta.totalBookedRooms));
          }
          const byBucket = new Map(r.rows.map((x) => [x.bucket, x]));
          setRows((rs) =>
            rs.map((row) => {
              const ai = byBucket.get(canonicalBucket(row.bucket) ?? row.bucket);
              return ai
                ? {
                    bucket: row.bucket,
                    propertyShare: String(ai.propertySharePct),
                    marketShare: String(ai.marketSharePct),
                    propertyAdr: String(ai.propertyAdr),
                    marketAdr: String(ai.marketAdr),
                  }
                : row;
            }),
          );
          setMsg({ ok: true, text: `Read ${r.rows.length} bucket(s) — review, then save.` });
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
        const r = await saveBookingWindowAction({
          property,
          period,
          meta: { window: windowLabel, dataAsOf, totalBookedRooms: totalBooked },
          rows,
        });
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
        <p className="text-sm font-medium text-foreground">Booking Window — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Attach the Booking.com &ldquo;Reservations per book window&rdquo; chart or paste the figures, then compile — or type
        them in. Per bucket: the property&rsquo;s and the market&rsquo;s reservation share (%) and ADR (IDR).
      </p>

      <UploadControls
        compact
        placeholder="Paste the Booking.com book-window shares &amp; ADR (property vs market)…"
        text={text}
        onText={setText}
        image={image}
        onImage={setImage}
        onCompile={compile}
        working={busyKind === "compile"}
        disabled={busy}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Window
          <input value={windowLabel} onChange={(e) => setWindowLabel(e.target.value)} placeholder="Last 90 days"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Data as of (YYYY-MM-DD)
          <input value={dataAsOf} onChange={(e) => setDataAsOf(e.target.value)} placeholder="2026-11-03"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Total booked rooms
          <input value={totalBooked} onChange={(e) => setTotalBooked(e.target.value)} inputMode="numeric" placeholder="211"
            className="rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-2 py-1.5">Booking window</th>
              {NUM_FIELDS.map((f) => (
                <th key={f.key} className="px-2 py-1.5 text-right">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.bucket} className="border-b border-border/60">
                <td className="px-2 py-1.5 text-xs font-medium text-foreground">{r.bucket}</td>
                {NUM_FIELDS.map((f) => (
                  <td key={f.key} className="px-2 py-1.5">
                    <input value={r[f.key]} onChange={(e) => setCell(i, f.key, e.target.value)} inputMode="numeric" placeholder={f.hint}
                      className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50">
          {busyKind === "save" ? "Saving…" : "Save Booking Window"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
