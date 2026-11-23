"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Label,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatIDR, formatNumber } from "@/lib/format";

export interface BookingWindowDatum {
  bucket: string;
  propertyShare: number; // percent
  marketShare: number; // percent
  propertyAdr: number;
  marketAdr: number;
}

const COLORS = {
  propertyShare: "#2563EB", // blue (my property)
  marketShare: "#93C5FD", // light blue (market)
  propertyAdr: "#E8833A", // orange (my ADR)
  marketAdr: "#C9A227", // gold (market ADR)
};

const SHARE_KEYS = new Set(["propertyShare", "marketShare"]);

function BookingWindowTooltip({
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
            {typeof e.value === "number"
              ? e.dataKey && SHARE_KEYS.has(e.dataKey)
                ? `${e.value.toFixed(1)}%`
                : formatIDR(e.value)
              : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Booking Window chart: reservation-share bars (property vs market) on the left
 * axis and average-daily-rate lines (property vs market, IDR) on the right, by
 * booking lead-time bucket.
 */
export function BookingWindowChart({ data }: { data: BookingWindowDatum[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={54}
          />
          <YAxis
            yAxisId="share"
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <YAxis
            yAxisId="adr"
            orientation="right"
            tickFormatter={(v: number) => formatNumber(v)}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={92}
          >
            <Label
              value="ADR (IDR)"
              angle={90}
              position="insideRight"
              style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" }}
            />
          </YAxis>
          <Tooltip content={<BookingWindowTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar yAxisId="share" dataKey="propertyShare" name="My property" fill={COLORS.propertyShare} radius={[3, 3, 0, 0]} maxBarSize={26} />
          <Bar yAxisId="share" dataKey="marketShare" name="Market" fill={COLORS.marketShare} radius={[3, 3, 0, 0]} maxBarSize={26} />
          <Line yAxisId="adr" dataKey="propertyAdr" name="My ADR" stroke={COLORS.propertyAdr} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line yAxisId="adr" dataKey="marketAdr" name="Market ADR" stroke={COLORS.marketAdr} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
