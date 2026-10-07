"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatIDR, formatIDRCompact } from "@/lib/format";

export interface WeeklyTrendDatum {
  label: string;
  revenue: number | null;
  occPct: number | null;
}

const REVENUE_COLOR = "#0F4C5C";
const OCC_COLOR = "#C9A227";

interface TooltipEntry {
  name?: string;
  value?: number | null;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
      {payload.map((e) => (
        <div key={String(e.dataKey)} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} aria-hidden />
          <span className="text-muted-foreground">{e.name}</span>
          <span className="ml-auto font-medium text-popover-foreground">
            {e.value == null ? "—" : e.dataKey === "occPct" ? `${Number(e.value).toFixed(1)}%` : formatIDR(Number(e.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Week-over-week headline trend: room revenue (bars, left axis) + occupancy % (line, right axis). */
export function WeeklyKpiTrendChart({ data }: { data: WeeklyTrendDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
          />
          <YAxis
            yAxisId="rev"
            tickFormatter={(v: number) => formatIDRCompact(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <YAxis
            yAxisId="occ"
            orientation="right"
            domain={[0, (max: number) => Math.max(100, Math.ceil(max))]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
          <Bar yAxisId="rev" dataKey="revenue" name="Room Revenue" fill={REVENUE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
          <Line yAxisId="occ" type="monotone" dataKey="occPct" name="Occupancy %" stroke={OCC_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
