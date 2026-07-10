"use client";

import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { GroupSeries } from "@/lib/group-data";

const COLORS = ["#0F4C5C", "#C9A227", "#64748B", "#1B6E80"];

/** Grouped bars: categories on X, one bar per property. Values are percentages. */
export function GroupGroupedBar({
  categories,
  series,
  reference,
}: {
  categories: string[];
  series: GroupSeries[];
  reference?: number;
}) {
  const data = categories.map((c, i) => {
    const row: Record<string, string | number | null> = { category: c };
    for (const s of series) row[s.code] = s.values[i] ?? null;
    return row;
  });
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={(v: number, name) => [`${v.toFixed(1)}%`, name]} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {reference != null && <ReferenceLine y={reference} stroke="#94A3B8" strokeDasharray="4 4" />}
          {series.map((s, i) => (
            <Bar key={s.code} dataKey={s.code} name={s.name} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={34} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
