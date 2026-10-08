"use client";

import { growthPercent } from "@/lib/weekly/calculations";
import { formatNumber } from "@/lib/format";
import { formatWeeklyVariance } from "@/lib/weekly/format";
import { cn } from "@/lib/utils";

export interface SocialGrowthPoint {
  name: string;
  lastWeek: number | null;
  thisWeek: number | null;
}

const dispNum = (v: number | null) => (v == null ? "—" : formatNumber(v));

/**
 * Section H preview — one small-multiple card per metric. Each card is
 * self-scaled (its own two bars share a local max) so a 1,400 metric and a
 * 103,000 metric are both legible, which a single shared-axis chart can't do.
 * Teal = This Week, Gold = Last Week. Value labels + legend provide the
 * secondary encoding the brand palette's low contrast requires.
 */
export function SocialGrowthChart({
  data,
  thisWeekLabel,
  lastWeekLabel,
}: {
  data: SocialGrowthPoint[];
  thisWeekLabel?: string;
  lastWeekLabel?: string;
}) {
  const hasData = data.some((d) => d.lastWeek != null || d.thisWeek != null);
  if (!hasData) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-teal ring-1 ring-inset ring-black/10" />
          This Week{thisWeekLabel ? ` · ${thisWeekLabel}` : ""}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-gold ring-1 ring-inset ring-black/10" />
          Last Week{lastWeekLabel ? ` · ${lastWeekLabel}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.map((d) => {
          const max = Math.max(d.thisWeek ?? 0, d.lastWeek ?? 0, 1);
          const gp = growthPercent(d.lastWeek, d.thisWeek);
          return (
            <div key={d.name} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{d.name}</p>
                <GrowthChip g={gp} />
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums leading-none text-foreground">
                {dispNum(d.thisWeek)}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">this week</p>
              <div className="mt-2.5 space-y-1.5">
                <Bar label="This" value={d.thisWeek} max={max} tone="teal" />
                <Bar label="Last" value={d.lastWeek} max={max} tone="gold" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GrowthChip({ g }: { g: number | null }) {
  if (g == null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const up = g >= 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        up ? "bg-variance-positive/10 text-variance-positive" : "bg-variance-negative/10 text-variance-negative",
      )}
    >
      {up ? "▲" : "▼"} {formatWeeklyVariance(g)}
    </span>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number | null;
  max: number;
  tone: "teal" | "gold";
}) {
  const pct = value == null ? 0 : Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full ring-1 ring-inset ring-black/10",
            tone === "teal" ? "bg-brand-teal" : "bg-brand-gold",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-foreground">{dispNum(value)}</span>
    </div>
  );
}
