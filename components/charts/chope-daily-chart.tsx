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

export interface ChopeDailyDatum {
  day: number;
  platformBookings: number; // Chope/Grab
  directBookings: number; // Restaurant channels
}

const PLATFORM = "#C9A227"; // gold — Chope/Grab
const DIRECT = "#0F4C5C"; // teal — Restaurant channels

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">Day {label}</p>
      {payload.map((e) => (
        <div key={e.name} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} aria-hidden />
          <span className="text-muted-foreground">{e.name}</span>
          <span className="ml-auto font-medium text-popover-foreground">
            {typeof e.value === "number" ? e.value.toLocaleString("en-US") : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Daily online bookings by source: grouped bars per day (Chope/Grab vs
 * Restaurant channels) — the "Traffic by Online Booking Sources" chart. */
export function ChopeDailyChart({ data }: { data: ChopeDailyDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barGap={1}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
            minTickGap={2}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar dataKey="platformBookings" name="Chope/Grab" fill={PLATFORM} radius={[2, 2, 0, 0]} maxBarSize={10} />
          <Bar dataKey="directBookings" name="Restaurant channels" fill={DIRECT} radius={[2, 2, 0, 0]} maxBarSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
