"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatIDR, formatIDRCompact } from "@/lib/format";

export interface WeeklyComparisonDatum {
  code: string;
  revenue: number | null;
}

const BASE_COLOR = "#0F4C5C";
const CURRENT_COLOR = "#C9A227";

interface TooltipEntry { value?: number | null }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const v = payload[0]?.value;
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      <p className="text-muted-foreground">
        Room Revenue <span className="ml-1 font-medium text-popover-foreground">{v == null ? "—" : formatIDR(Number(v))}</span>
      </p>
    </div>
  );
}

/** Room revenue by property for the snapshot week; the current property is gold. */
export function WeeklyComparisonChart({
  data,
  currentCode,
}: {
  data: WeeklyComparisonDatum[];
  currentCode: string;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="code"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => formatIDRCompact(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Bar dataKey="revenue" name="Room Revenue" radius={[4, 4, 0, 0]} maxBarSize={72}>
            {data.map((d) => (
              <Cell key={d.code} fill={d.code === currentCode ? CURRENT_COLOR : BASE_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
