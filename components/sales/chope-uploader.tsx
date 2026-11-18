"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  extractRestaurantChopeAction,
  saveRestaurantChopeAction,
} from "@/app/dashboard/[property]/[period]/restaurant/actions";
import { UploadControls, type UploadImage } from "@/components/sales/upload-controls";
import type { ChopeDailyPoint, ChopeSummary } from "@/lib/dashboard-data";
import type { ChopePart } from "@/lib/sales/chope-ai";
import { cn } from "@/lib/utils";

type CoreKey =
  | "fulfilledBookings" | "fulfilledCovers"
  | "cancelledBookings" | "cancelledCovers"
  | "noShows" | "noShowCovers"
  | "upcomingBookings" | "upcomingCovers"
  | "walkinBookings" | "walkinCovers"
  | "revenue" | "revenuePct"
  | "platformBookings" | "platformCovers"
  | "directBookings" | "directCovers";

type Core = Record<CoreKey, string>;
type DailyMap = Record<number, { platform: string; direct: string }>;

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const EMPTY_CORE: Core = {
  fulfilledBookings: "", fulfilledCovers: "",
  cancelledBookings: "", cancelledCovers: "",
  noShows: "", noShowCovers: "",
  upcomingBookings: "", upcomingCovers: "",
  walkinBookings: "", walkinCovers: "",
  revenue: "", revenuePct: "",
  platformBookings: "", platformCovers: "",
  directBookings: "", directCovers: "",
};

const s = (n: number | null | undefined) => (n == null ? "" : String(n));

function coreFromInitial(c: ChopeSummary | null): Core {
  if (!c) return { ...EMPTY_CORE };
  return {
    fulfilledBookings: s(c.fulfilledBookings), fulfilledCovers: s(c.fulfilledCovers),
    cancelledBookings: s(c.cancelledBookings), cancelledCovers: s(c.cancelledCovers),
    noShows: s(c.noShows), noShowCovers: s(c.noShowCovers),
    upcomingBookings: s(c.upcomingBookings), upcomingCovers: s(c.upcomingCovers),
    walkinBookings: s(c.walkinBookings), walkinCovers: s(c.walkinCovers),
    revenue: s(c.revenue), revenuePct: s(c.revenuePctGiven),
    platformBookings: s(c.platformBookings), platformCovers: s(c.platformCovers),
    directBookings: s(c.directBookings), directCovers: s(c.directCovers),
  };
}

const dailyFromInitial = (rows: ChopeDailyPoint[]): DailyMap => {
  const m: DailyMap = {};
  for (const r of rows) m[r.day] = { platform: String(r.platformBookings), direct: String(r.directBookings) };
  return m;
};

/** A labelled Bookings/Covers input pair. */
function BCRow({
  label, core, setCore, bKey, cKey,
}: { label: string; core: Core; setCore: (k: CoreKey, v: string) => void; bKey: CoreKey; cKey: CoreKey }) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-2 py-1.5 text-xs text-foreground">{label}</td>
      <td className="px-2 py-1.5">
        <input value={core[bKey]} onChange={(e) => setCore(bKey, e.target.value)} inputMode="numeric" placeholder="0"
          className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
      </td>
      <td className="px-2 py-1.5">
        <input value={core[cKey]} onChange={(e) => setCore(cKey, e.target.value)} inputMode="numeric" placeholder="0"
          className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
      </td>
    </tr>
  );
}

export function ChopeUploader({
  property, period, initialCore, initialDaily, hasData,
}: {
  property: string;
  period: string;
  initialCore: ChopeSummary | null;
  initialDaily: ChopeDailyPoint[];
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [core, setCore] = useState<Core>(() => coreFromInitial(initialCore));
  const [daily, setDaily] = useState<DailyMap>(() => dailyFromInitial(initialDaily));
  const [texts, setTexts] = useState<Record<ChopePart, string>>({ traffic: "", revenue: "", sources: "", daily: "" });
  const [images, setImages] = useState<Record<ChopePart, UploadImage>>({ traffic: null, revenue: null, sources: null, daily: null });
  const [dailyApproximate, setDailyApproximate] = useState(false);
  const [busyKind, setBusyKind] = useState<null | ChopePart | "save">(null);
  const busy = busyKind !== null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCoreCell = (k: CoreKey, v: string) => setCore((c) => ({ ...c, [k]: v }));
  const setText = (p: ChopePart, v: string) => setTexts((t) => ({ ...t, [p]: v }));
  const setImage = (p: ChopePart, v: UploadImage) => setImages((im) => ({ ...im, [p]: v }));
  const setDailyCell = (day: number, field: "platform" | "direct", v: string) =>
    setDaily((m) => ({ ...m, [day]: { platform: "", direct: "", ...m[day], [field]: v } }));

  const dailyFilled = DAYS.filter((d) => daily[d]?.platform?.trim() || daily[d]?.direct?.trim()).length;

  function compile(part: ChopePart) {
    setMsg(null);
    setBusyKind(part);
    void (async () => {
      try {
        const r = await extractRestaurantChopeAction({
          property, part,
          text: texts[part].trim() || null,
          imageBase64: images[part]?.base64 ?? null,
          imageMediaType: images[part]?.mediaType ?? null,
        });
        if (!r.ok) {
          setMsg({ ok: false, text: r.error ?? "Could not read that." });
          return;
        }
        if (part === "daily" && r.daily) {
          setDaily((m) => {
            const next = { ...m };
            for (const d of r.daily!) next[d.day] = { platform: String(d.platformBookings), direct: String(d.directBookings) };
            return next;
          });
          setDailyApproximate(!!r.approximate);
          setMsg({
            ok: true,
            text: r.approximate
              ? `Estimated ${r.daily.length} day(s) from the chart — check before saving.`
              : `Read ${r.daily.length} day(s) — review, then save.`,
          });
        } else if (r.values) {
          setCore((c) => {
            const next = { ...c };
            for (const [k, v] of Object.entries(r.values!)) {
              if (v != null && (k in next)) next[k as CoreKey] = String(v);
            }
            return next;
          });
          setMsg({ ok: true, text: `Read the ${part} figures — review, then save.` });
        }
      } catch {
        setMsg({ ok: false, text: "Could not compile — please try again." });
      } finally {
        setBusyKind(null);
      }
    })();
  }

  function save() {
    const dailyRows = DAYS.filter((d) => daily[d]?.platform?.trim() || daily[d]?.direct?.trim()).map((d) => ({
      day: d,
      platformBookings: daily[d]!.platform || "0",
      directBookings: daily[d]!.direct || "0",
    }));
    setMsg(null);
    setBusyKind("save");
    void (async () => {
      try {
        const r = await saveRestaurantChopeAction({ property, period, core, daily: dailyRows });
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) router.refresh();
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

  const slot = (part: ChopePart, placeholder: string) => (
    <UploadControls
      compact
      placeholder={placeholder}
      text={texts[part]}
      onText={(v) => setText(part, v)}
      image={images[part]}
      onImage={(v) => setImage(part, v)}
      onCompile={() => compile(part)}
      working={busyKind === part}
      disabled={busy}
    />
  );

  return (
    <div className="space-y-5 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Chope Reservations — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Four parts upload <strong>separately</strong> — each has its own paste / screenshot and Compile, so the AI reads
        every screenshot cleanly. Review the figures, then Save once. Give the AI the <strong>numbers</strong>, not a chart.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1 — Traffic Summary */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-foreground">1 · Traffic Summary (funnel)</p>
          {slot("traffic", "Paste / attach the Traffic Summary (Fulfilled, Cancelled, No Show, Upcoming, Walk-ins)…")}
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[300px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5 text-right">Bookings</th>
                  <th className="px-2 py-1.5 text-right">Covers</th>
                </tr>
              </thead>
              <tbody>
                <BCRow label="Fulfilled" core={core} setCore={setCoreCell} bKey="fulfilledBookings" cKey="fulfilledCovers" />
                <BCRow label="Cancelled" core={core} setCore={setCoreCell} bKey="cancelledBookings" cKey="cancelledCovers" />
                <BCRow label="No Show" core={core} setCore={setCoreCell} bKey="noShows" cKey="noShowCovers" />
                <BCRow label="Upcoming" core={core} setCore={setCoreCell} bKey="upcomingBookings" cKey="upcomingCovers" />
                <BCRow label="Walk-ins" core={core} setCore={setCoreCell} bKey="walkinBookings" cKey="walkinCovers" />
              </tbody>
            </table>
          </div>
        </div>

        {/* 2 — Revenue */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-foreground">2 · Revenue</p>
          {slot("revenue", "Paste / attach the Chope revenue line (e.g. CHOPE · Rp9,805,025 · 5.73%)…")}
          <div className="flex flex-wrap gap-3 rounded-md border border-border bg-card p-3">
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">Chope revenue (IDR)</span>
              <input value={core.revenue} onChange={(e) => setCoreCell("revenue", e.target.value)} inputMode="numeric" placeholder="0"
                className="w-full rounded-md border border-border bg-card px-2 py-1 text-right text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
            </label>
            <label className="w-28 space-y-1">
              <span className="text-xs text-muted-foreground">% of restaurant</span>
              <input value={core.revenuePct} onChange={(e) => setCoreCell("revenuePct", e.target.value)} inputMode="decimal" placeholder="—"
                className="w-full rounded-md border border-border bg-card px-2 py-1 text-right text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
            </label>
          </div>
        </div>

        {/* 3 — Booking Sources */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-foreground">3 · Booking Sources</p>
          {slot("sources", "Paste / attach Booking Sources (Chope/Grab vs Restaurant Channels)…")}
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[300px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5">Source</th>
                  <th className="px-2 py-1.5 text-right">Bookings</th>
                  <th className="px-2 py-1.5 text-right">Covers</th>
                </tr>
              </thead>
              <tbody>
                <BCRow label="Chope/Grab" core={core} setCore={setCoreCell} bKey="platformBookings" cKey="platformCovers" />
                <BCRow label="Restaurant channels" core={core} setCore={setCoreCell} bKey="directBookings" cKey="directCovers" />
              </tbody>
            </table>
          </div>
        </div>

        {/* 4 — Daily */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-foreground">
            4 · Daily online bookings <span className="font-normal text-muted-foreground">({dailyFilled}/31 days)</span>
          </p>
          {slot("daily", "Paste / attach the day-by-day online-bookings NUMBERS table (Chope/Grab + Restaurant channels)…")}
          {dailyApproximate && (
            <p className="rounded-md bg-[hsl(var(--brand-gold))]/10 px-2.5 py-1.5 text-xs text-[hsl(var(--brand-gold))]">
              ⚠ Estimated from a chart — check the numbers before saving.
            </p>
          )}
          <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[280px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5">Day</th>
                  <th className="px-2 py-1.5 text-right">Chope/Grab</th>
                  <th className="px-2 py-1.5 text-right">Rest. ch.</th>
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d) => (
                  <tr key={d} className="border-b border-border/60">
                    <td className="px-2 py-1 text-xs text-muted-foreground">{d}</td>
                    <td className="px-2 py-1">
                      <input value={daily[d]?.platform ?? ""} onChange={(e) => setDailyCell(d, "platform", e.target.value)} inputMode="numeric" placeholder="—"
                        className="w-16 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                    </td>
                    <td className="px-2 py-1">
                      <input value={daily[d]?.direct ?? ""} onChange={(e) => setDailyCell(d, "direct", e.target.value)} inputMode="numeric" placeholder="—"
                        className="w-16 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50">
          {busyKind === "save" ? "Saving…" : "Save Chope report"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
