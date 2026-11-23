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

export interface MarketAreaDatum {
  month: string;
  propertyRN: number;
  marketRN: number;
  propertyAdr: number;
  marketAdr: number;
}

const COLORS = {
  propertyRN: "#0F4C5C", // brand teal
  marketRN: "#9CC3D0", // light teal
  propertyAdr: "#E8833A", // orange
  marketAdr: "#C9A227", // brand gold
};

const RN_KEYS = new Set(["propertyRN", "marketRN"]);

function MarketAreaTooltip({
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
              ? e.dataKey && RN_KEYS.has(e.dataKey)
                ? formatNumber(e.value)
                : formatIDR(e.value)
              : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Booking.com Market Area chart: room-night bars (property vs market) on the
 * left axis and average-daily-rate lines (property vs market, IDR) on the right.
 */
export function MarketAreaChart({ data }: { data: MarketAreaDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            yAxisId="rn"
            tickFormatter={(v: number) => formatNumber(v)}
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
          <Tooltip content={<MarketAreaTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar yAxisId="rn" dataKey="propertyRN" name="Room nights" fill={COLORS.propertyRN} radius={[3, 3, 0, 0]} maxBarSize={34} />
          <Bar yAxisId="rn" dataKey="marketRN" name="Room nights (Market)" fill={COLORS.marketRN} radius={[3, 3, 0, 0]} maxBarSize={34} />
          <Line yAxisId="adr" dataKey="propertyAdr" name="ADR IDR" stroke={COLORS.propertyAdr} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line yAxisId="adr" dataKey="marketAdr" name="ADR IDR (Market)" stroke={COLORS.marketAdr} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
