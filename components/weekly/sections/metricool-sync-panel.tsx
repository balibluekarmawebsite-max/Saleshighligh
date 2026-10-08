"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { growth, growthPercent } from "@/lib/weekly/calculations";
import { formatNumber } from "@/lib/format";
import { formatWeeklyVariance, weeklyVarianceColor } from "@/lib/weekly/format";
import { syncMetricoolNow } from "@/lib/weekly/metricool-actions";
import type { MetricoolSyncResult } from "@/lib/weekly/metricool-sync";
import { cn } from "@/lib/utils";
import { weeklyHref } from "@/lib/nav";

const dispNum = (v: number | null) => (v == null ? "—" : formatNumber(v));
const signed = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${formatNumber(v)}`);

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Section H — pull Instagram + Facebook metrics from Metricool into the grid below. */
export function MetricoolSyncPanel({
  property,
  week,
  locked,
  configured,
  blogId,
  initialMeta,
}: {
  property: string;
  week: string;
  locked: boolean;
  configured: boolean;
  blogId: string | null;
  initialMeta: MetricoolSyncResult | null;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<MetricoolSyncResult | null>(initialMeta);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const settingsHref = weeklyHref(property, week, "settings");

  if (!configured) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Auto-fill from Metricool isn&apos;t connected. Enter these metrics manually below, or{" "}
        <Link href={settingsHref} className="text-primary hover:underline">connect Metricool in Settings</Link>.
      </div>
    );
  }

  if (!blogId) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Metricool is connected, but no brand is assigned to {property}. Assign one in{" "}
        <Link href={settingsHref} className="text-primary hover:underline">Settings → Social Media</Link>{" "}
        to sync Instagram + Facebook automatically.
      </div>
    );
  }

  function sync() {
    setError(null);
    setMessage(null);
    start(async () => {
      const r = await syncMetricoolNow(property, week);
      if (!r.ok) {
        setError(r.message ?? "Sync failed.");
        return;
      }
      setMessage(r.message ?? "Synced.");
      if (r.result) setMeta(r.result);
      // Reload so the grid below re-seeds from the newly-saved values.
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base font-semibold text-foreground">Metricool</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Brand <code className="text-xs">{blogId}</code> · pulls Instagram + Facebook for this week and last week.
            {meta && <> · Last synced {fmtDate(meta.syncedAt)}</>}
          </p>
        </div>
        {!locked && (
          <Button type="button" size="sm" onClick={sync} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {meta ? "Re-sync from Metricool" : "Sync from Metricool"}
          </Button>
        )}
      </div>

      {message && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-variance-positive">
          <Check className="h-3.5 w-3.5" /> {message}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-variance-negative">{error}</p>}

      {meta && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">
            This week {meta.window.thisWeek.from} → {meta.window.thisWeek.to} · last week{" "}
            {meta.window.lastWeek.from} → {meta.window.lastWeek.to}
          </p>
          {meta.networks.map((net) => (
            <div key={net.platform}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{net.platform}</p>
              {net.wrote ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="py-1.5 pr-3 text-left">Metric</th>
                        <th className="py-1.5 px-3 text-right">Last Week</th>
                        <th className="py-1.5 px-3 text-right">This Week</th>
                        <th className="py-1.5 px-3 text-right">Growth</th>
                        <th className="py-1.5 px-3 text-right">Growth %</th>
                        <th className="py-1.5 pl-3 text-left">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {net.metrics.map((m) => {
                        const g = growth(m.lastWeek, m.thisWeek);
                        const gp = growthPercent(m.lastWeek, m.thisWeek);
                        return (
                          <tr key={m.key} className="border-b border-border/60">
                            <td className="py-1.5 pr-3 font-medium text-foreground">{m.label}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums">{dispNum(m.lastWeek)}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums">{dispNum(m.thisWeek)}</td>
                            <td className={cn("py-1.5 px-3 text-right tabular-nums", weeklyVarianceColor(g))}>{signed(g)}</td>
                            <td className={cn("py-1.5 px-3 text-right tabular-nums", weeklyVarianceColor(gp))}>
                              {formatWeeklyVariance(gp)}
                            </td>
                            <td className="py-1.5 pl-3 text-left text-xs text-muted-foreground">
                              {m.metric ?? <span className="text-variance-negative">not found</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50/50 p-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    No {net.platform} metrics resolved. Tried:{" "}
                    <code className="text-[11px]">
                      {Array.from(new Set(net.metrics.flatMap((m) => m.tried))).join(", ") || "—"}
                    </code>
                    . If the account has {net.platform} connected, set{" "}
                    <code className="text-[11px]">METRICOOL_METRIC_MAP</code> on the server to the correct names.
                  </span>
                </div>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Synced values are written into the editable grid below — adjust and Save as usual.
          </p>
        </div>
      )}
    </div>
  );
}
