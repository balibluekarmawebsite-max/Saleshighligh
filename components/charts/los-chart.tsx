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

export interface LosDatum {
  bucket: string;
  thisYear: number;
  lastYear: number | null;
}

function LosTooltip({
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
      <p className="mb-1 font-medium text-popover-foreground">{label} night(s)</p>
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

/** Room nights per length-of-stay bucket, this year vs last year. */
export function LosChart({ data }: { data: LosDatum[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={<LosTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar dataKey="thisYear" name="This Year" fill="#0F4C5C" radius={[3, 3, 0, 0]} maxBarSize={44} />
          <Bar dataKey="lastYear" name="Last Year" fill="#DDBE5A" radius={[3, 3, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
