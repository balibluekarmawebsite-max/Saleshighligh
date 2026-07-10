"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { GroupSeries } from "@/lib/group-data";
import { formatIDR, formatIDRCompact } from "@/lib/format";

const COLORS = ["#0F4C5C", "#C9A227", "#64748B", "#1B6E80"];

/** Total revenue by property, stacked over the last 12 months. */
export function GroupTrendChart({ months, series }: { months: string[]; series: GroupSeries[] }) {
  const data = months.map((m, i) => {
    const row: Record<string, string | number> = { month: m };
    for (const s of series) row[s.code] = s.values[i] ?? 0;
    return row;
  });
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis tickFormatter={(v: number) => formatIDRCompact(v)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={72} />
          <Tooltip
            formatter={(v: number, name) => [formatIDR(v), name]}
            contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))" }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {series.map((s, i) => (
            <Bar key={s.code} dataKey={s.code} name={s.name} stackId="rev" fill={COLORS[i % COLORS.length]} maxBarSize={44} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
