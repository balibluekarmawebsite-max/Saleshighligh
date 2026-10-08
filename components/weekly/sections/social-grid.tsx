"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";

import { growth, growthPercent } from "@/lib/weekly/calculations";
import { SOCIAL_METRIC_ROWS, SOCIAL_PLATFORMS } from "@/lib/weekly/editor-data";
import { saveWeeklySocial } from "@/lib/weekly/editor-actions";
import { formatNumber } from "@/lib/format";
import { formatWeeklyVariance, weeklyVarianceColor } from "@/lib/weekly/format";
import {
  CELL,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  toNum,
} from "@/components/weekly/sections/shared";
import { cn } from "@/lib/utils";

type Cells = Record<string, { lastWeek: string; thisWeek: string }>;
type ByPlatform = Record<string, Cells>;

const signed = (n: number | null) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${formatNumber(n)}`;

/** Section H — Social Media Insight: last week vs this week, growth computed. */
export function SocialGrid({
  property,
  week,
  locked,
  initial,
}: {
  property: string;
  week: string;
  locked: boolean;
  initial: ByPlatform;
}) {
  const [platform, setPlatform] = useState<string>(SOCIAL_PLATFORMS[0]);
  const [byPlatform, setByPlatform] = useState<ByPlatform>(initial);
  const [state, formAction] = useFormState(saveWeeklySocial, null);

  const sig = JSON.stringify(initial);
  useEffect(() => {
    setByPlatform(JSON.parse(sig) as ByPlatform);
  }, [sig]);

  const cells = byPlatform[platform] ?? {};
  const valOf = (key: string) => cells[key] ?? { lastWeek: "", thisWeek: "" };
  const setVal = (key: string, field: "lastWeek" | "thisWeek", v: string) =>
    setByPlatform((b) => {
      const next = { ...(b[platform] ?? {}) };
      next[key] = { ...(next[key] ?? { lastWeek: "", thisWeek: "" }), [field]: v };
      return { ...b, [platform]: next };
    });

  const rows = SOCIAL_METRIC_ROWS.map((m) => ({
    metricKey: m.key,
    lastWeek: valOf(m.key).lastWeek,
    thisWeek: valOf(m.key).thisWeek,
  }));

  return (
    <SectionCardShell>
      <form action={formAction}>
        <input type="hidden" name="property" value={property} />
        <input type="hidden" name="week" value={week} />
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            title="H · Social Media Insight"
            subtitle="Last 7 days vs previous week. Growth is calculated."
          />
          <div className="flex items-center gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              disabled={locked}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground"
              aria-label="Platform"
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {!locked && <SaveButton state={state} />}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 text-left">Metric</th>
                <th className="py-2 px-3 text-right">Last Week</th>
                <th className="py-2 px-3 text-right">This Week</th>
                <th className="py-2 px-3 text-right">Growth</th>
                <th className="py-2 px-3 text-right">Growth %</th>
              </tr>
            </thead>
            <tbody>
              {SOCIAL_METRIC_ROWS.map((m) => {
                const v = valOf(m.key);
                const last = toNum(v.lastWeek);
                const now = toNum(v.thisWeek);
                const g = growth(last, now);
                const gp = growthPercent(last, now);
                return (
                  <tr key={m.key} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium text-foreground">{m.label}</td>
                    <td className="py-1.5 px-3">
                      <input
                        inputMode="numeric"
                        value={v.lastWeek}
                        onChange={(e) => setVal(m.key, "lastWeek", e.target.value)}
                        disabled={locked}
                        className={`${CELL} text-right`}
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        inputMode="numeric"
                        value={v.thisWeek}
                        onChange={(e) => setVal(m.key, "thisWeek", e.target.value)}
                        disabled={locked}
                        className={`${CELL} text-right`}
                      />
                    </td>
                    <td className={cn("py-2 px-3 text-right tabular-nums", weeklyVarianceColor(g))}>
                      {signed(g)}
                    </td>
                    <td className={cn("py-2 px-3 text-right tabular-nums", weeklyVarianceColor(gp))}>
                      {formatWeeklyVariance(gp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Each platform saves separately — switch the selector to enter another platform.
        </p>
      </form>
    </SectionCardShell>
  );
}
