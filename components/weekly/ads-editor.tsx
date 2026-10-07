"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AD_PLATFORMS } from "@/lib/weekly/ads";
import { saveWeeklyAds, syncWeeklyAds } from "@/lib/weekly/ads-actions";
import { type WeeklyAdsData } from "@/lib/weekly/ads-data";

type Row = { spend: string; revenue: string; conversions: string; impressions: string; clicks: string };
const EMPTY_ROW: Row = { spend: "", revenue: "", conversions: "", impressions: "", clicks: "" };
const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export function AdsEditor({
  property,
  week,
  locked,
  data,
}: {
  property: string;
  week: string;
  locked: boolean;
  data: WeeklyAdsData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const byPlatform: Record<string, { spend: number | null; revenue: number | null; conversions: number | null; impressions: number | null; clicks: number | null } | null> = {
    blended: data.blended,
    google: data.platforms.find((p) => p.platform === "google") ?? null,
    meta: data.platforms.find((p) => p.platform === "meta") ?? null,
  };

  const [grid, setGrid] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      AD_PLATFORMS.map((p) => {
        const r = byPlatform[p.id];
        return [p.id, r ? { spend: s(r.spend), revenue: s(r.revenue), conversions: s(r.conversions), impressions: s(r.impressions), clicks: s(r.clicks) } : { ...EMPTY_ROW }];
      }),
    ),
  );

  const set = (platform: string, field: keyof Row, value: string) =>
    setGrid((g) => ({ ...g, [platform]: { ...(g[platform] ?? EMPTY_ROW), [field]: value } }));

  function onSave() {
    setSaveMsg(null);
    startTransition(async () => {
      const rows = AD_PLATFORMS.map((p) => ({ platform: p.id, ...(grid[p.id] ?? EMPTY_ROW) }));
      const r = await saveWeeklyAds({ property, week, rows });
      setSaveMsg(r.ok ? "Saved." : r.message ?? "Save failed.");
      if (r.ok) router.refresh();
    });
  }

  function onSync() {
    setSyncMsg(null);
    startTransition(async () => {
      const r = await syncWeeklyAds(property, week);
      if (r.ok) {
        const w = r.window?.from ? ` for ${r.window.from} → ${r.window.to}` : "";
        setSyncMsg({ ok: true, text: `Synced ${r.synced ?? 0} rows${w}.` });
        router.refresh();
      } else {
        setSyncMsg({ ok: false, text: r.message ?? "Sync failed." });
      }
    });
  }

  const cols: { key: keyof Row; label: string }[] = [
    { key: "spend", label: "Spend" },
    { key: "revenue", label: "Revenue" },
    { key: "conversions", label: "Conversions" },
    { key: "impressions", label: "Impressions" },
    { key: "clicks", label: "Clicks" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pull from the ads dashboard, or enter manually. <span className="font-medium text-foreground">Revenue</span> is booked revenue for the Blended row and attributed value for Google/Meta.
          {data.window.from && (
            <span className="ml-1">Window: {data.window.from} → {data.window.to}.</span>
          )}
          {data.source && <span className="ml-1">Source: {data.source}{data.syncedAt ? `, synced ${data.syncedAt.slice(0, 16).replace("T", " ")}` : ""}.</span>}
        </p>
        {!locked && (
          <Button type="button" variant="outline" size="sm" onClick={onSync} disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now
          </Button>
        )}
      </div>
      {syncMsg && (
        <p className={syncMsg.ok ? "text-sm text-variance-positive" : "text-sm text-variance-negative"}>{syncMsg.text}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">Platform</th>
              {cols.map((c) => <th key={c.key} className="py-2 pr-3 text-right font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {AD_PLATFORMS.map((p) => (
              <tr key={p.id} className="border-b border-border/60">
                <td className="py-2 pr-3 font-medium text-foreground">{p.label}</td>
                {cols.map((c) => (
                  <td key={c.key} className="py-1.5 pr-2">
                    <input
                      inputMode="decimal"
                      value={grid[p.id]?.[c.key] ?? ""}
                      onChange={(e) => set(p.id, c.key, e.target.value)}
                      disabled={locked}
                      className="h-8 w-28 rounded-md border border-border bg-card px-2 text-right text-sm text-foreground disabled:opacity-60"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!locked && (
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={onSave} disabled={pending}>Save</Button>
          {saveMsg && (
            <span className={saveMsg === "Saved." ? "flex items-center gap-1 text-sm text-variance-positive" : "text-sm text-variance-negative"}>
              {saveMsg === "Saved." && <Check className="h-4 w-4" />} {saveMsg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
