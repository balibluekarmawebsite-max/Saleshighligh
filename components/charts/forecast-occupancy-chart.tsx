"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ForecastDatum {
  month: string; // short label, e.g. "Jul"
  forecast: number | null;
  lastYear: number | null;
  marketDemand: number | null;
}

const SERIES = [
  { key: "forecast", name: "Forecast", color: "#0F4C5C" },
  { key: "lastYear", name: "Last Year", color: "#94A3B8" },
  { key: "marketDemand", name: "Market Demand", color: "#C9A227" },
] as const;

function pctTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((e) => (
        <div key={e.name} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} aria-hidden />
          <span className="text-muted-foreground">{e.name}</span>
          <span className="ml-auto font-medium text-popover-foreground">
            {typeof e.value === "number" ? `${e.value.toFixed(1)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ForecastOccupancyChart({ data }: { data: ForecastDatum[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[0, 100]}
          />
          <Tooltip content={pctTooltip} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={26} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
