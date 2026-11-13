"use client";

import { useRef, useState } from "react";
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
type Img = { base64: string; mediaType: string; name: string } | null;

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
  rows.reduce((s, r) => s + (parsePctToRatio(r[key]) ?? 0) * 100, 0);

/** A scoped upload control: paste textarea + screenshot/file attach + Compile. */
function UploadControls({
  placeholder,
  text,
  onText,
  image,
  onImage,
  onCompile,
  working,
  disabled,
}: {
  placeholder: string;
  text: string;
  onText: (v: string) => void;
  image: Img;
  onImage: (v: Img) => void;
  onCompile: () => void;
  working: boolean;
  disabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  function pick(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      onImage({ base64, mediaType: file.type || "image/png", name: file.name });
    };
    reader.readAsDataURL(file);
  }
  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          {image ? `📎 ${image.name}` : "Attach screenshot / file"}
        </button>
        {image && (
          <button type="button" onClick={() => onImage(null)} className="text-xs text-variance-negative hover:underline">
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={onCompile}
          disabled={disabled || (!text.trim() && !image)}
          className="ml-auto rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {working ? "Working…" : "Compile with AI"}
        </button>
      </div>
    </div>
  );
}

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
  const [channels, setChannels] = useState<ChannelRow[]>(() => channelsFromInitial(initialChannels));
  const [daily, setDaily] = useState<DailyMap>(() => dailyFromInitial(initialDaily));

  const [channelText, setChannelText] = useState("");
  const [channelImage, setChannelImage] = useState<Img>(null);
  const [dailyText, setDailyText] = useState("");
  const [dailyImage, setDailyImage] = useState<Img>(null);
  const [dailyApproximate, setDailyApproximate] = useState(false);

  const [busyKind, setBusyKind] = useState<null | "channels" | "daily" | "save">(null);
  const busy = busyKind !== null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const bookingSum = pctSum(channels, "bookingsPct");
  const coverSum = pctSum(channels, "coversPct");
  const dailyFilled = DAYS.filter((d) => daily[d]?.bookings?.trim() && daily[d]?.covers?.trim()).length;

  function setChannelCell(i: number, field: keyof ChannelRow, value: string) {
    setChannels((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function setDailyCell(day: number, field: "bookings" | "covers", value: string) {
    setDaily((m) => ({ ...m, [day]: { bookings: "", covers: "", ...m[day], [field]: value } }));
  }

  function compileChannels() {
    setMsg(null);
    setBusyKind("channels");
    void (async () => {
      try {
        const r = await extractRestaurantAcquisitionAction({
          property,
          mode: "channels",
          text: channelText.trim() || null,
          imageBase64: channelImage?.base64 ?? null,
          imageMediaType: channelImage?.mediaType ?? null,
        });
        if (r.ok && r.channels && r.channels.length > 0) {
          setChannels(
            r.channels.map((c) => ({
              channel: c.channel,
              bookingsPct: String(+(c.bookingsPct * 100).toFixed(2)),
              coversPct: String(+(c.coversPct * 100).toFixed(2)),
            })),
          );
          setMsg({ ok: true, text: `Read ${r.channels.length} channel(s) — review, then save.` });
        } else if (r.ok) {
          setMsg({ ok: false, text: "No channels read — upload the channel list (name + Booking % + Cover %)." });
        } else {
          setMsg({ ok: false, text: r.error ?? "Could not read the channels." });
        }
      } catch {
        setMsg({ ok: false, text: "Could not compile — please try again." });
      } finally {
        setBusyKind(null);
      }
    })();
  }

  function compileDaily() {
    setMsg(null);
    setBusyKind("daily");
    void (async () => {
      try {
        const r = await extractRestaurantAcquisitionAction({
          property,
          mode: "daily",
          text: dailyText.trim() || null,
          imageBase64: dailyImage?.base64 ?? null,
          imageMediaType: dailyImage?.mediaType ?? null,
        });
        if (r.ok && r.daily && r.daily.length > 0) {
          setDaily((m) => {
            const next = { ...m };
            for (const d of r.daily!) next[d.day] = { bookings: String(d.bookings), covers: String(d.covers) };
            return next;
          });
          setDailyApproximate(!!r.approximate);
          setMsg({
            ok: true,
            text: r.approximate
              ? `Estimated ${r.daily.length} day(s) from the chart — these are approximate, please check them before saving.`
              : `Read ${r.daily.length} day(s) — review, then save.`,
          });
        } else if (r.ok) {
          setMsg({ ok: false, text: "No daily rows read — paste/screenshot the day-by-day Bookings/Covers table." });
        } else {
          setMsg({ ok: false, text: r.error ?? "Could not read the daily table." });
        }
      } catch {
        setMsg({ ok: false, text: "Could not compile — please try again." });
      } finally {
        setBusyKind(null);
      }
    })();
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
    setBusyKind("save");
    void (async () => {
      try {
        const r = await saveRestaurantAcquisitionAction({ property, period, channels: channelRows, daily: dailyRows });
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) router.refresh();
      } finally {
        setBusyKind(null);
      }
    })();
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
    <div className="space-y-4 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Acquisition Split — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        The two parts upload <strong>separately</strong> so the AI reads each cleanly. Channels are free text (any set
        each month); percentages are stored as entered. For the daily chart, upload the <strong>numbers table</strong>,
        not the chart picture.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Channels ─────────────────────────────── */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-foreground">1 · Channels (Booking % &amp; Cover %)</p>
          <UploadControls
            placeholder="Paste the channel split (name, booking %, cover %) — or attach the table / pie legend…"
            text={channelText}
            onText={setChannelText}
            image={channelImage}
            onImage={setChannelImage}
            onCompile={compileChannels}
            working={busyKind === "channels"}
            disabled={busy}
          />
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

        {/* ── Daily ────────────────────────────────── */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-foreground">
            2 · Daily Cover vs Booking <span className="font-normal text-muted-foreground">({dailyFilled}/31 days)</span>
          </p>
          <UploadControls
            placeholder="Paste the day-by-day table (day, bookings, covers) — or attach a screenshot of the NUMBERS table…"
            text={dailyText}
            onText={setDailyText}
            image={dailyImage}
            onImage={setDailyImage}
            onCompile={compileDaily}
            working={busyKind === "daily"}
            disabled={busy}
          />
          {dailyApproximate && (
            <p className="rounded-md bg-[hsl(var(--brand-gold))]/10 px-2.5 py-1.5 text-xs text-[hsl(var(--brand-gold))]">
              ⚠ These were estimated from a chart — please check the numbers before saving.
            </p>
          )}
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

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
        >
          {busyKind === "save" ? "Saving…" : "Save acquisition split"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
