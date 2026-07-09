"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { formatIDR, formatNumber } from "@/lib/format";

// Categorical palette (fixed order): teal, gold, teal-light, gold-light, slate,
// plus extras so up to ~8 segments stay distinguishable.
const COLORS = [
  "#0F4C5C", "#C9A227", "#1B6E80", "#DDBE5A",
  "#64748B", "#0A3642", "#9E7F1B", "#94A3B8",
];

export interface MixDatum {
  label: string;
  value: number;
}

function MixTooltip({
  active,
  payload,
  valueFormat,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number }[];
  valueFormat: "idr" | "number";
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const fmt = valueFormat === "idr" ? formatIDR : formatNumber;
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{entry?.name}</p>
      <p className="text-muted-foreground">{fmt(entry?.value ?? 0)}</p>
    </div>
  );
}

export function RevenueMixChart({
  data,
  valueFormat = "idr",
}: {
  data: MixDatum[];
  valueFormat?: "idr" | "number";
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            label={({ percent }) =>
              percent !== undefined && percent > 0.03
                ? `${(percent * 100).toFixed(0)}%`
                : ""
            }
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={COLORS[i % COLORS.length]}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<MixTooltip valueFormat={valueFormat} />} />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
