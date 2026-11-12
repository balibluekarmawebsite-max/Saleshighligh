"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { extractOtaRankingAction, saveOtaRankingAction } from "@/app/dashboard/[property]/[period]/marketing/actions";
import type { RankCard, RankHistoryRow } from "@/lib/dashboard-data";
import { formatNumber } from "@/lib/format";
import { RANKING_PLATFORMS, RANKING_PLATFORM_LABEL, type RankingPlatform } from "@/lib/sales/ota-ranking-logic";
import { cn } from "@/lib/utils";

type FormRow = { rank: string; total: string; rating: string };
const emptyForm = (): Record<RankingPlatform, FormRow> => ({
  BOOKING: { rank: "", total: "", rating: "" },
  EXPEDIA: { rank: "", total: "", rating: "" },
  TRIPADVISOR: { rank: "", total: "", rating: "" },
});

function RankChange({ change }: { change: number | null }) {
  if (change === null) return <span className="text-xs text-muted-foreground">no prior month</span>;
  if (change === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3.5 w-3.5" /> no change
      </span>
    );
  const improved = change > 0; // lower rank is better
  const Icon = improved ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", improved ? "text-variance-positive" : "text-variance-negative")}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(change)} {improved ? "improved" : "dropped"}
    </span>
  );
}

export function OtaRankingPanel({
  property,
  period,
  rankCards,
  rankHistory,
  canEdit,
}: {
  property: string;
  period: string;
  rankCards: RankCard[];
  rankHistory: RankHistoryRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<Record<RankingPlatform, FormRow>>(() => {
    const f = emptyForm();
    for (const c of rankCards) {
      const pl = c.platform as RankingPlatform;
      if (f[pl]) {
        f[pl] = {
          rank: c.rank != null ? String(c.rank) : "",
          total: c.totalInMarket != null ? String(c.totalInMarket) : "",
          rating: c.rating != null ? String(c.rating) : "",
        };
      }
    }
    return f;
  });
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function setCell(pl: RankingPlatform, key: keyof FormRow, value: string) {
    setForm((f) => ({ ...f, [pl]: { ...f[pl], [key]: value } }));
  }

  function compile() {
    setMsg(null);
    startBusy(async () => {
      const r = await extractOtaRankingAction({
        property,
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
      });
      if (r.ok && r.rankings) {
        setForm((prev) => {
          const next = { ...prev };
          for (const row of r.rankings!) {
            next[row.platform] = {
              rank: String(row.rank),
              total: row.totalInMarket != null ? String(row.totalInMarket) : "",
              rating: row.rating != null ? String(row.rating) : "",
            };
          }
          return next;
        });
        setMsg({ ok: true, text: `Read ${r.rankings.length} platform(s) — review, then save.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not read the ranking." });
      }
    });
  }

  function save() {
    // Send raw strings; the server parses them (locale-aware) in one place.
    const rankings = RANKING_PLATFORMS.map((pl) => ({
      platform: pl,
      rank: form[pl].rank,
      totalInMarket: form[pl].total,
      rating: form[pl].rating,
    })).filter((r) => r.rank.trim() !== "");

    if (rankings.length === 0) {
      setMsg({ ok: false, text: "Enter at least one platform rank." });
      return;
    }
    setMsg(null);
    startBusy(async () => {
      const r = await saveOtaRankingAction({ property, period, rankings });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setEditing(false);
        setText("");
        setImage(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Current rank cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {rankCards.map((r) => (
          <div key={r.platform} className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">{RANKING_PLATFORM_LABEL[r.platform as RankingPlatform] ?? r.platform}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {r.rank !== null ? `#${r.rank}` : "—"}
              {r.totalInMarket !== null && <span className="ml-1 text-sm font-normal text-muted-foreground">of {formatNumber(r.totalInMarket)}</span>}
            </p>
            <div className="mt-1">
              <RankChange change={r.change} />
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
          >
            {editing ? "Close" : "Update ranking"}
          </button>
        )}
        {rankHistory.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-medium text-brand-teal hover:underline"
          >
            {showAll ? "Hide track record" : `Show all recorded rankings (${rankHistory.length} month${rankHistory.length === 1 ? "" : "s"})`}
          </button>
        )}
      </div>

      {/* Editor: manual + AI */}
      {canEdit && editing && (
        <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
          <p className="text-sm font-medium text-foreground">Update OTA ranking for {period}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 pr-3 font-medium">Platform</th>
                  <th className="pb-1 pr-3 font-medium">Rank</th>
                  <th className="pb-1 pr-3 font-medium">Of (market)</th>
                  <th className="pb-1 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {RANKING_PLATFORMS.map((pl) => (
                  <tr key={pl}>
                    <td className="py-1 pr-3 text-foreground">{RANKING_PLATFORM_LABEL[pl]}</td>
                    {(["rank", "total", "rating"] as const).map((key) => (
                      <td key={key} className="py-1 pr-3">
                        <input
                          value={form[pl][key]}
                          onChange={(e) => setCell(pl, key, e.target.value)}
                          inputMode="decimal"
                          placeholder={key === "rank" ? "#" : key === "total" ? "—" : "0–5"}
                          className="w-20 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border border-border/70 bg-card/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Or compile with AI — paste the ranking text or attach a screenshot</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="e.g. Booking.com #5 of 1,248 · 9.1 — Tripadvisor #3 of 48 · 4.5"
              className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                {image ? `📎 ${image.name}` : "Attach screenshot"}
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
                className="ml-auto rounded-md border border-brand-teal px-3 py-1.5 text-xs font-medium text-brand-teal transition-colors hover:bg-brand-teal/10 disabled:opacity-50"
              >
                {busy ? "Working…" : "Compile with AI"}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save ranking"}
            </button>
            {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
          </div>
        </div>
      )}
      {canEdit && !editing && msg && (
        <p className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>
      )}

      {/* Track record */}
      {showAll && rankHistory.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2 text-left">Month</th>
                {RANKING_PLATFORMS.map((pl) => (
                  <th key={pl} className="px-3 py-2 text-right">{RANKING_PLATFORM_LABEL[pl]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rankHistory.map((row) => (
                <tr key={row.period} className={cn("border-b border-border/60", row.period === period && "bg-accent/40")}>
                  <td className="px-3 py-2 text-foreground">{row.month}</td>
                  {RANKING_PLATFORMS.map((pl) => {
                    const c = row[pl];
                    return (
                      <td key={pl} className="px-3 py-2 text-right tabular-nums text-foreground">
                        {c ? (
                          <>
                            #{c.rank}
                            {c.totalInMarket !== null && <span className="text-muted-foreground"> / {formatNumber(c.totalInMarket)}</span>}
                            {c.rating !== null && <span className="ml-1 text-xs text-muted-foreground">★{c.rating}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
