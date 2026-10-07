"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AdsTrendPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

type MetricKey = "spend" | "impressions" | "clicks" | "conversions";
const METRICS: { key: MetricKey; label: string; money?: boolean }[] = [
  { key: "spend", label: "Spend", money: true },
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "conversions", label: "Conversions" },
];

const COLOR = "#0F4C5C";

/** Performance over time — a daily area chart with a metric toggle. */
export function AdsTrendChart({ data }: { data: AdsTrendPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const active = METRICS.find((m) => m.key === metric)!;
  const fmtY = (v: number) => (active.money ? formatIDRCompact(v) : formatNumber(v));
  const fmtTip = (v: number) => (active.money ? formatIDR(v) : formatNumber(v));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              metric === m.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="adsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={16} />
            <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={56} />
            <Tooltip
              formatter={(v: number) => [fmtTip(v), active.label]}
              labelFormatter={(d: string) => d}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))" }}
            />
            <Area type="monotone" dataKey={metric} stroke={COLOR} strokeWidth={2} fill="url(#adsFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
