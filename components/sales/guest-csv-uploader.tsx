"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  importGuestCsvAction,
  previewGuestCsvAction,
  type GuestCsvPreview,
} from "@/app/admin/guests-import/actions";
import { flagEmoji } from "@/lib/geo";
import { cn } from "@/lib/utils";

type PropertyOption = { code: string; name: string };

const fmt = (n: number | null | undefined): string =>
  n == null ? "—" : Math.round(n).toLocaleString("en-US");

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsText(file);
  });
}

export function GuestCsvUploader({ properties }: { properties: PropertyOption[] }) {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [csvName, setCsvName] = useState<string | null>(null);
  const [lyText, setLyText] = useState("");
  const [lyName, setLyName] = useState<string | null>(null);
  const [property, setProperty] = useState("");
  const [period, setPeriod] = useState("");
  const [scope, setScope] = useState<"MTD" | "YTD">("MTD");
  const [preview, setPreview] = useState<GuestCsvPreview | null>(null);
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const lyRef = useRef<HTMLInputElement>(null);

  async function pickCsv(file: File | undefined, which: "main" | "ly") {
    if (!file) return;
    try {
      const text = await readFileText(file);
      if (which === "main") {
        setCsvText(text);
        setCsvName(file.name);
        setPreview(null);
        setMsg(null);
        // Reset the target so the next preview re-detects from THIS file — never
        // carry the previous CSV's property/period/last-year into a new upload.
        setProperty("");
        setPeriod("");
        setLyText("");
        setLyName(null);
      } else {
        setLyText(text);
        setLyName(file.name);
      }
    } catch {
      setMsg({ ok: false, text: "Could not read that file." });
    }
  }

  function runPreview() {
    setMsg(null);
    startBusy(async () => {
      const r = await previewGuestCsvAction(csvText);
      setPreview(r);
      if (r.ok) {
        if (!property && r.meta?.propertyHint) setProperty(r.meta.propertyHint);
        if (!period && r.meta?.periodHint) setPeriod(r.meta.periodHint);
        setMsg({ ok: true, text: `Parsed ${r.meta?.rowCount ?? 0} arrival(s) — review, then import.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not parse the CSV." });
      }
    });
  }

  function runImport() {
    if (!property || !/^\d{4}-\d{2}$/.test(period)) {
      setMsg({ ok: false, text: "Pick a property and a period (YYYY-MM) first." });
      return;
    }
    setMsg(null);
    startBusy(async () => {
      const r = await importGuestCsvAction({ property, period, scope, csvText, lastYearCsvText: lyText || undefined });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  const topNats = preview?.ok ? (preview.nationalities ?? []).slice(0, 15) : [];
  // Flag when the chosen target disagrees with what the CSV header says, so an
  // import to the wrong property/period can't slip through silently.
  const mismatch =
    preview?.ok === true &&
    ((!!preview.meta?.propertyHint && property !== "" && preview.meta.propertyHint !== property) ||
      (!!preview.meta?.periodHint && period !== "" && preview.meta.periodHint !== period));

  return (
    <div className="space-y-5">
      {/* File pickers */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pickCsv(e.target.files?.[0], "main")} />
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Arrival Guest CSV</span>
          <button
            type="button"
            onClick={() => csvRef.current?.click()}
            className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
          >
            {csvName ? `📎 ${csvName}` : "Choose CSV…"}
          </button>
        </div>

        <input ref={lyRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pickCsv(e.target.files?.[0], "ly")} />
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Last-year CSV (optional, for VS LY)</span>
          <button
            type="button"
            onClick={() => lyRef.current?.click()}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {lyName ? `📎 ${lyName}` : "Choose CSV…"}
          </button>
        </div>

        <button
          type="button"
          onClick={runPreview}
          disabled={busy || !csvText.trim()}
          className="ml-auto rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {busy ? "Working…" : "Preview"}
        </button>
      </div>

      {msg && <p className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>}

      {/* Target + import */}
      {preview?.ok && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-secondary/20 p-4">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Property</span>
              <select
                value={property}
                onChange={(e) => setProperty(e.target.value)}
                className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:border-brand-teal focus:outline-none"
              >
                <option value="">Select…</option>
                {properties.map((p) => (
                  <option key={p.code} value={p.code}>{p.code}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Period (YYYY-MM)</span>
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="2026-10"
                className="w-28 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Scope</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "MTD" | "YTD")}
                className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:border-brand-teal focus:outline-none"
              >
                <option value="MTD">MTD (month + builds LOS)</option>
                <option value="YTD">YTD (Jan→month)</option>
              </select>
            </label>
            <div className="ml-auto text-xs text-muted-foreground">
              Detected:{" "}
              <strong className="text-foreground">{preview.meta?.propertyHint ?? "?"}</strong> ·{" "}
              <strong className="text-foreground">{preview.meta?.periodHint ?? "?"}</strong> ·{" "}
              {preview.totals?.arrivals ?? 0} arrivals · {fmt(preview.totals?.roomNights)} room nights
              {preview.meta?.skipped ? ` · ${preview.meta.skipped} skipped` : ""}
            </div>
            <button
              type="button"
              onClick={runImport}
              disabled={busy}
              className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${scope}`}
            </button>
          </div>

          {mismatch && (
            <p className="rounded-md border border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/10 px-3 py-2 text-xs text-foreground">
              ⚠ The CSV header says <strong>{preview.meta?.propertyHint ?? "?"} · {preview.meta?.periodHint ?? "?"}</strong>,
              but you&rsquo;re importing to <strong>{property || "?"} · {period || "?"}</strong>. Double-check before
              importing — this replaces that property/period&rsquo;s guest data.
            </p>
          )}

          {/* Preview tables */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-sm font-medium text-foreground">Nationality (room nights) — top 15</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-2">#</th>
                      <th className="py-1.5 pr-2">Country</th>
                      <th className="py-1.5 pr-2 text-right">Room Nights</th>
                      <th className="py-1.5 text-right">Guests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topNats.map((n, i) => (
                      <tr key={`${n.countryCode ?? n.countryName}`} className="border-b border-border/60">
                        <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                        <td className="py-1.5 pr-2 text-foreground">
                          <span className="mr-1">{flagEmoji(n.countryCode)}</span>
                          {n.countryName}
                          {!n.countryCode && <span className="ml-1 text-[10px] text-variance-negative">(unmatched)</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{fmt(n.roomNights)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmt(n.guests)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-2 text-sm font-medium text-foreground">Length of Stay</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-2">Nights</th>
                      <th className="py-1.5 pr-2 text-right">Bookings</th>
                      <th className="py-1.5 text-right">Room Nights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.los ?? []).map((l) => (
                      <tr key={l.losBucket} className="border-b border-border/60">
                        <td className="py-1.5 pr-2 text-foreground">{l.losBucket}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{fmt(l.bookings)}</td>
                        <td className="py-1.5 text-right tabular-nums text-foreground">{fmt(l.roomNights)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
