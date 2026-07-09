"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { formatIDR } from "@/lib/format";

// Categorical palette (fixed order): teal, gold, teal-light, gold-light, slate.
const COLORS = ["#0F4C5C", "#C9A227", "#1B6E80", "#DDBE5A", "#64748B"];

export interface MixDatum {
  label: string;
  value: number;
}

function MixTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; payload?: { percent?: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{entry?.name}</p>
      <p className="text-muted-foreground">{formatIDR(entry?.value ?? 0)}</p>
    </div>
  );
}

export function RevenueMixChart({ data }: { data: MixDatum[] }) {
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
          <Tooltip content={<MixTooltip />} />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
