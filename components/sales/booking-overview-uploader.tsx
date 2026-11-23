"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  extractBookingOverviewAction,
  saveBookingOverviewAction,
} from "@/app/dashboard/[property]/[period]/market/actions";
import { UploadControls, type UploadImage } from "@/components/sales/upload-controls";
import type { BookingOverviewData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

/** Scalar rows: value (+ optional market value) + "vs market" %. */
const SCALARS: { key: string; label: string; vs: string; mkt: string | null }[] = [
  { key: "searchResultsViews", label: "Search results views", vs: "searchResultsViewsVsMkt", mkt: null },
  { key: "propertyPageVisits", label: "Property page visits", vs: "propertyPageVisitsVsMkt", mkt: null },
  { key: "bookingsMade", label: "Bookings made", vs: "bookingsMadeVsMkt", mkt: null },
  { key: "searchToPagePct", label: "Search-to-page %", vs: "searchToPageVsMkt", mkt: "searchToPageMarketPct" },
  { key: "pageToBookingPct", label: "Page-to-booking %", vs: "pageToBookingVsMkt", mkt: "pageToBookingMarketPct" },
  { key: "availabilityPct", label: "Availability for search %", vs: "availabilityVsMkt", mkt: null },
];

const CORE_FIELDS = SCALARS.flatMap((s) => (s.mkt ? [s.key, s.vs, s.mkt] : [s.key, s.vs]));

type Form = Record<string, string>;

interface AvailRow {
  month: string;
  yourPct: string;
  marketPct: string;
}

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

function seedForm(initial: BookingOverviewData | null): Form {
  const f: Form = Object.fromEntries(CORE_FIELDS.map((k) => [k, ""]));
  if (!initial) return f;
  const src = initial as unknown as Record<string, number | null>;
  for (const k of CORE_FIELDS) {
    const v = src[k];
    f[k] = v === null || v === undefined ? "" : String(v);
  }
  return f;
}

function seedAvail(initial: BookingOverviewData | null, period: string): AvailRow[] {
  if (initial && initial.availability.length > 0) {
    return initial.availability.map((a) => ({ month: a.month, yourPct: String(a.yourPct), marketPct: String(a.marketPct) }));
  }
  return monthsEndingAt(period, 5).map((month) => ({ month, yourPct: "", marketPct: "" }));
}

export function BookingOverviewUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: BookingOverviewData | null;
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [windowLabel, setWindowLabel] = useState(initial?.windowLabel ?? "Last 90 days");
  const [dataAsOf, setDataAsOf] = useState(initial?.dataAsOf ?? "");
  const [form, setForm] = useState<Form>(() => seedForm(initial));
  const [avail, setAvail] = useState<AvailRow[]>(() => seedAvail(initial, period));
  const [text, setText] = useState("");
  const [image, setImage] = useState<UploadImage>(null);
  const [busyKind, setBusyKind] = useState<null | "compile" | "save">(null);
  const busy = busyKind !== null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCell = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setAvailCell = (i: number, k: keyof AvailRow, v: string) =>
    setAvail((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addAvail = () => setAvail((rs) => [...rs, { month: "", yourPct: "", marketPct: "" }]);
  const removeAvail = (i: number) => setAvail((rs) => rs.filter((_, idx) => idx !== i));

  function compile() {
    setMsg(null);
    setBusyKind("compile");
    void (async () => {
      try {
        const r = await extractBookingOverviewAction({
          property,
          text: text.trim() || null,
          imageBase64: image?.base64 ?? null,
          imageMediaType: image?.mediaType ?? null,
        });
        if (r.ok && r.core) {
          const c = r.core as unknown as Record<string, number | null>;
          if (r.core.windowLabel) setWindowLabel(r.core.windowLabel);
          if (r.core.dataAsOf) setDataAsOf(r.core.dataAsOf);
          setForm((f) => {
            const next = { ...f };
            for (const k of CORE_FIELDS) {
              const v = c[k];
              if (v !== null && v !== undefined) next[k] = String(v);
            }
            return next;
          });
          if (r.avail && r.avail.length > 0) {
            setAvail(r.avail.map((a) => ({ month: a.month, yourPct: String(a.yourPct), marketPct: String(a.marketPct) })));
          }
          setMsg({ ok: true, text: `Read the overview${r.avail && r.avail.length ? ` + ${r.avail.length} trend month(s)` : ""} — review, then save.` });
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
        const core = { ...form, window: windowLabel, dataAsOf };
        const r = await saveBookingOverviewAction({ property, period, core, avail });
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
        <p className="text-sm font-medium text-foreground">Booking.com Overview — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Attach the Booking.com &ldquo;How your searches turned into bookings&rdquo; and &ldquo;Availability for search&rdquo;
        screenshots or paste the figures, then compile — or type them in. Capture each value and its &ldquo;vs market&rdquo; %.
      </p>

      <UploadControls
        compact
        placeholder="Paste the Booking.com search-performance figures (views, visits, bookings, conversion, availability…)…"
        text={text}
        onText={setText}
        image={image}
        onImage={setImage}
        onCompile={compile}
        working={busyKind === "compile"}
        disabled={busy}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Window
          <input value={windowLabel} onChange={(e) => setWindowLabel(e.target.value)} placeholder="Last 90 days"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Data as of (YYYY-MM-DD)
          <input value={dataAsOf} onChange={(e) => setDataAsOf(e.target.value)} placeholder="2026-10-23"
            className="rounded-md border border-border bg-card px-2 py-1 text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-2 py-1.5">Metric</th>
              <th className="px-2 py-1.5 text-right">Value</th>
              <th className="px-2 py-1.5 text-right">Market</th>
              <th className="px-2 py-1.5 text-right">vs Market %</th>
            </tr>
          </thead>
          <tbody>
            {SCALARS.map((s) => (
              <tr key={s.key} className="border-b border-border/60">
                <td className="px-2 py-1.5 text-xs text-foreground">{s.label}</td>
                <td className="px-2 py-1.5">
                  <input value={form[s.key] ?? ""} onChange={(e) => setCell(s.key, e.target.value)} inputMode="decimal" placeholder="0"
                    className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                </td>
                <td className="px-2 py-1.5">
                  {s.mkt ? (
                    <input value={form[s.mkt] ?? ""} onChange={(e) => setCell(s.mkt!, e.target.value)} inputMode="decimal" placeholder="e.g. 3.32"
                      className="w-24 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  ) : (
                    <span className="block pr-2 text-right text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input value={form[s.vs] ?? ""} onChange={(e) => setCell(s.vs, e.target.value)} inputMode="decimal" placeholder="e.g. -22.84"
                    className="w-24 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Availability trend (monthly, your % vs market %)</p>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-2 py-1.5">Month (YYYY-MM)</th>
                <th className="px-2 py-1.5 text-right">Your %</th>
                <th className="px-2 py-1.5 text-right">Market %</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {avail.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-2 py-1.5">
                    <input value={r.month} onChange={(e) => setAvailCell(i, "month", e.target.value)} placeholder="2026-10"
                      className="w-24 rounded-md border border-border bg-card px-2 py-1 text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={r.yourPct} onChange={(e) => setAvailCell(i, "yourPct", e.target.value)} inputMode="decimal" placeholder="e.g. 68"
                      className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={r.marketPct} onChange={(e) => setAvailCell(i, "marketPct", e.target.value)} inputMode="decimal" placeholder="e.g. 40"
                      className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" onClick={() => removeAvail(i)} className="text-xs text-muted-foreground hover:text-variance-negative">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addAvail} disabled={busy}
          className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50">
          + Add month
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50">
          {busyKind === "save" ? "Saving…" : "Save Booking.com Overview"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
