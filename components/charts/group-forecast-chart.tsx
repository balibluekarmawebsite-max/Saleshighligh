"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { GroupSeries } from "@/lib/group-data";

const COLORS = ["#0F4C5C", "#C9A227", "#64748B", "#1B6E80"];

/**
 * 6-month occupancy forecast: one line per property, plus a shaded market-demand
 * band drawn as two faint dashed bounds.
 */
export function GroupForecastChart({
  months,
  series,
  demandLow,
  demandHigh,
}: {
  months: string[];
  series: GroupSeries[];
  demandLow: (number | null)[];
  demandHigh: (number | null)[];
}) {
  const data = months.map((m, i) => {
    const row: Record<string, string | number | null> = { month: m, demandLow: demandLow[i] ?? null, demandHigh: demandHigh[i] ?? null };
    for (const s of series) row[s.code] = s.values[i] ?? null;
    return row;
  });
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={(v: number, name) => [typeof v === "number" ? `${v.toFixed(1)}%` : "—", name]} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Line dataKey="demandLow" name="Market demand (low)" stroke="#CBD5E1" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls legendType="none" />
          <Line dataKey="demandHigh" name="Market demand" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
          {series.map((s, i) => (
            <Line key={s.code} dataKey={s.code} name={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
