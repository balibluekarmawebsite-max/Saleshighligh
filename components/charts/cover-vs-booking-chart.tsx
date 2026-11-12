"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface CoverBookingDatum {
  day: number;
  covers: number;
  bookings: number;
}

const COVER = "#E4572E"; // red
const BOOKING = "#3B5BA5"; // blue

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

/**
 * Daily "Cover vs Booking" chart: two overlaid areas across the days of the
 * month — covers (red) behind, bookings (blue) in front (covers ≥ bookings).
 */
export function CoverVsBookingChart({ data }: { data: CoverBookingDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
            minTickGap={4}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Area type="monotone" dataKey="covers" name="Cover" stroke={COVER} fill={COVER} fillOpacity={0.3} strokeWidth={2} />
          <Area type="monotone" dataKey="bookings" name="Booking" stroke={BOOKING} fill={BOOKING} fillOpacity={0.45} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
