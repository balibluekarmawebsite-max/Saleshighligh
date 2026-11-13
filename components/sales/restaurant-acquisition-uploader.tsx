"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  extractRestaurantAcquisitionAction,
  saveRestaurantAcquisitionAction,
} from "@/app/dashboard/[property]/[period]/restaurant/actions";
import type { AcqDailyPoint, AcqRow } from "@/lib/dashboard-data";
import { parsePctToRatio } from "@/lib/sales/restaurant-acquisition-logic";
import { cn } from "@/lib/utils";

interface ChannelRow {
  channel: string;
  bookingsPct: string; // percent (0–100) as typed
  coversPct: string;
}

type DailyMap = Record<number, { bookings: string; covers: string }>;

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const blankChannel = (): ChannelRow => ({ channel: "", bookingsPct: "", coversPct: "" });

const channelsFromInitial = (rows: AcqRow[]): ChannelRow[] =>
  rows.length === 0
    ? [blankChannel(), blankChannel(), blankChannel()]
    : rows.map((r) => ({ channel: r.label, bookingsPct: String(r.bookingsPct), coversPct: String(r.coversPct) }));

const dailyFromInitial = (rows: AcqDailyPoint[]): DailyMap => {
  const m: DailyMap = {};
  for (const r of rows) m[r.day] = { bookings: String(r.bookings), covers: String(r.covers) };
  return m;
};

const pctSum = (rows: ChannelRow[], key: "bookingsPct" | "coversPct"): number =>
  rows.reduce((s, r) => {
    const ratio = parsePctToRatio(r[key]);
    return s + (ratio ?? 0) * 100;
  }, 0);

export function RestaurantAcquisitionUploader({
  property,
  period,
  initialChannels,
  initialDaily,
  hasData,
}: {
  property: string;
  period: string;
  initialChannels: AcqRow[];
  initialDaily: AcqDailyPoint[];
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [channels, setChannels] = useState<ChannelRow[]>(() => channelsFromInitial(initialChannels));
  const [daily, setDaily] = useState<DailyMap>(() => dailyFromInitial(initialDaily));
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bookingSum = pctSum(channels, "bookingsPct");
  const coverSum = pctSum(channels, "coversPct");
  const dailyFilled = DAYS.filter((d) => daily[d]?.bookings?.trim() && daily[d]?.covers?.trim()).length;

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

  function setChannelCell(i: number, field: keyof ChannelRow, value: string) {
    setChannels((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function setDailyCell(day: number, field: "bookings" | "covers", value: string) {
    setDaily((m) => ({ ...m, [day]: { bookings: "", covers: "", ...m[day], [field]: value } }));
  }

  function compile() {
    setMsg(null);
    startBusy(async () => {
      const r = await extractRestaurantAcquisitionAction({
        property,
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
      });
      if (!r.ok) {
        setMsg({ ok: false, text: r.error ?? "Could not read that." });
        return;
      }
      if (r.channels && r.channels.length > 0) {
        setChannels(
          r.channels.map((c) => ({
            channel: c.channel,
            bookingsPct: String(+(c.bookingsPct * 100).toFixed(2)),
            coversPct: String(+(c.coversPct * 100).toFixed(2)),
          })),
        );
      }
      if (r.daily && r.daily.length > 0) {
        setDaily((m) => {
          const next = { ...m };
          for (const d of r.daily!) next[d.day] = { bookings: String(d.bookings), covers: String(d.covers) };
          return next;
        });
      }
      const parts: string[] = [];
      if (r.channels?.length) parts.push(`${r.channels.length} channel(s)`);
      if (r.daily?.length) parts.push(`${r.daily.length} day(s)`);
      setMsg({ ok: true, text: parts.length ? `Read ${parts.join(" + ")} — review, then save.` : "Nothing read." });
    });
  }

  function save() {
    const channelRows = channels
      .filter((r) => r.channel.trim() !== "" && r.bookingsPct.trim() !== "" && r.coversPct.trim() !== "")
      .map((r) => ({ channel: r.channel, bookingsPct: r.bookingsPct, coversPct: r.coversPct }));
    const dailyRows = DAYS.filter((d) => daily[d]?.bookings?.trim() && daily[d]?.covers?.trim()).map((d) => ({
      day: d,
      bookings: daily[d]!.bookings,
      covers: daily[d]!.covers,
    }));
    if (channelRows.length === 0 && dailyRows.length === 0) {
      setMsg({ ok: false, text: "Add at least one channel (name + booking % + cover %) or some daily rows." });
      return;
    }
    setMsg(null);
    startBusy(async () => {
      const r = await saveRestaurantAcquisitionAction({ property, period, channels: channelRows, daily: dailyRows });
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
        <p className="text-sm font-medium text-foreground">Acquisition Split — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload <strong>either</strong> the channel split (Booking % / Cover % per channel) <strong>or</strong> the
        day-by-day bookings/covers table — the AI detects which one it is and fills the matching grid below (you can also
        upload both, or type them in). Give the AI the <strong>numbers</strong>, not the chart picture. Channels are free
        text (any set each month); percentages are stored as entered; the daily table drives the Cover-vs-Booking chart.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the channel split (name, booking %, cover %) and/or the daily bookings/covers table…"
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Channels grid */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Channels (Booking % &amp; Cover %)</p>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5">Channel</th>
                  <th className="px-2 py-1.5 text-right">Booking %</th>
                  <th className="px-2 py-1.5 text-right">Cover %</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {channels.map((r, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="px-2 py-1.5">
                      <input
                        value={r.channel}
                        onChange={(e) => setChannelCell(i, "channel", e.target.value)}
                        placeholder="e.g. Walk-in"
                        className="w-32 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.bookingsPct}
                        onChange={(e) => setChannelCell(i, "bookingsPct", e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className="w-16 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={r.coversPct}
                        onChange={(e) => setChannelCell(i, "coversPct", e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className="w-16 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setChannels((rs) => (rs.length <= 1 ? [blankChannel()] : rs.filter((_, idx) => idx !== i)))}
                        className="text-xs text-variance-negative hover:underline"
                        aria-label="Remove channel"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border text-xs font-semibold text-foreground">
                  <td className="px-2 py-1.5">Sum</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", Math.abs(bookingSum - 100) > 1 && "text-variance-negative")}>{bookingSum.toFixed(1)}%</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", Math.abs(coverSum - 100) > 1 && "text-variance-negative")}>{coverSum.toFixed(1)}%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <button type="button" onClick={() => setChannels((rs) => [...rs, blankChannel()])} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            + Add channel
          </button>
        </div>

        {/* Daily grid */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">
            Daily Cover vs Booking <span className="font-normal text-muted-foreground">({dailyFilled}/31 days)</span>
          </p>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-card">
            <table className="w-full min-w-[280px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5">Day</th>
                  <th className="px-2 py-1.5 text-right">Bookings</th>
                  <th className="px-2 py-1.5 text-right">Covers</th>
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d) => (
                  <tr key={d} className="border-b border-border/60">
                    <td className="px-2 py-1 text-xs text-muted-foreground">{d}</td>
                    <td className="px-2 py-1">
                      <input
                        value={daily[d]?.bookings ?? ""}
                        onChange={(e) => setDailyCell(d, "bookings", e.target.value)}
                        inputMode="numeric"
                        placeholder="—"
                        className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={daily[d]?.covers ?? ""}
                        onChange={(e) => setDailyCell(d, "covers", e.target.value)}
                        inputMode="numeric"
                        placeholder="—"
                        className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save acquisition split"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
