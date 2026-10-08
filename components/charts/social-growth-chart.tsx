"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber } from "@/lib/format";

export interface SocialGrowthPoint {
  name: string;
  lastWeek: number | null;
  thisWeek: number | null;
}

/** Last-week vs this-week line chart across the social metrics (one platform). */
export function SocialGrowthChart({ data }: { data: SocialGrowthPoint[] }) {
  const hasData = data.some((d) => d.lastWeek != null || d.thisWeek != null);
  if (!hasData) return null;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(v)} width={56} />
        <Tooltip
          formatter={(v: number) => formatNumber(v)}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="lastWeek" name="Last Week" stroke="#C9A227" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="thisWeek" name="This Week" stroke="#0F4C5C" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
