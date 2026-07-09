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

import { formatNumber } from "@/lib/format";

export interface NationalityDatum {
  name: string;
  thisYear: number;
  lastYear: number | null;
}

function RnTooltip({
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
            {typeof e.value === "number" ? `${formatNumber(e.value)} RN` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Top nationalities: this year vs last year room nights (horizontal). */
export function NationalityBarChart({ data }: { data: NationalityDatum[] }) {
  const height = Math.max(280, data.length * 44);
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip content={<RnTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="thisYear" name="This Year" fill="#0F4C5C" radius={[0, 3, 3, 0]} maxBarSize={14} />
          <Bar dataKey="lastYear" name="Last Year" fill="#94A3B8" radius={[0, 3, 3, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
