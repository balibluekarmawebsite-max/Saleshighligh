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

export interface SojernChartDatum {
  month: string;
  [year: string]: number | string | null;
}

// Oldest → newest, matching the Sojern palette (orange, navy, light blue, teal).
const YEAR_PALETTE = ["#E8833A", "#0F2A4A", "#9CC3D0", "#2F6FBF", "#C9A227", "#6B7280"];

function SojernTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((e) => (
        <div key={e.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} aria-hidden />
          <span className="text-muted-foreground">{e.name}</span>
          <span className="ml-auto font-medium text-popover-foreground">
            {typeof e.value === "number" ? `${e.value > 0 ? "+" : ""}${e.value.toFixed(0)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Sojern volume index: one line per year, % difference vs the baseline across
 * the 12 months. Used for both the flight and hotel indices.
 */
export function SojernIndexChart({ years, data }: { years: number[]; data: SojernChartDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
            width={48}
          />
          <Tooltip content={<SojernTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {years.map((y, i) => (
            <Line
              key={y}
              dataKey={String(y)}
              name={String(y)}
              stroke={YEAR_PALETTE[i % YEAR_PALETTE.length]}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
