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

export interface RankTrendDatum {
  month: string;
  BOOKING: number | null;
  EXPEDIA: number | null;
  TRIPADVISOR: number | null;
}

const LINES = [
  { key: "BOOKING", name: "Booking.com", color: "#0F4C5C" },
  { key: "EXPEDIA", name: "Expedia", color: "#C9A227" },
  { key: "TRIPADVISOR", name: "Tripadvisor", color: "#1B6E80" },
] as const;

function RankTooltip({
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
            {typeof e.value === "number" ? `#${e.value}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 12-month OTA rank trend. Y axis reversed so up = better (lower rank number). */
export function RankTrendChart({ data }: { data: RankTrendDatum[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis reversed allowDecimals={false} tickFormatter={(v: number) => `#${v}`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<RankTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          {LINES.map((l) => (
            <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
