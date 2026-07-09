"use client";

import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { formatIDR } from "@/lib/format";

export interface QuadrantPoint {
  name: string;
  x: number; // RN achievement %
  y: number; // ADR achievement %
  z: number; // revenue (bubble size)
}

const QUADRANTS = [
  { key: "star", label: "Star", color: "#15803D", desc: "RN & ADR ≥ budget" },
  { key: "volume", label: "Volume-driven", color: "#0F4C5C", desc: "RN ≥, ADR <" },
  { key: "rate", label: "Rate-driven", color: "#C9A227", desc: "RN <, ADR ≥" },
  { key: "under", label: "Underperforming", color: "#B91C1C", desc: "RN & ADR <" },
] as const;

function colorFor(x: number, y: number): string {
  if (x >= 100 && y >= 100) return QUADRANTS[0].color;
  if (x >= 100 && y < 100) return QUADRANTS[1].color;
  if (x < 100 && y >= 100) return QUADRANTS[2].color;
  return QUADRANTS[3].color;
}

function QuadTooltip({ active, payload }: { active?: boolean; payload?: { payload?: QuadrantPoint }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{p.name}</p>
      <p className="text-muted-foreground">RN achievement: {p.x.toFixed(1)}%</p>
      <p className="text-muted-foreground">ADR achievement: {p.y.toFixed(1)}%</p>
      <p className="text-muted-foreground">Revenue: {formatIDR(p.z)}</p>
    </div>
  );
}

export function RoomTypeQuadrantChart({ points }: { points: QuadrantPoint[] }) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(90, ...xs) - 5;
  const xMax = Math.max(110, ...xs) + 5;
  const yMin = Math.min(90, ...ys) - 5;
  const yMax = Math.max(110, ...ys) + 5;

  return (
    <div className="space-y-3">
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[Math.floor(xMin), Math.ceil(xMax)]}
              name="RN achievement"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              label={{ value: "RN achievement %", position: "bottom", fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[Math.floor(yMin), Math.ceil(yMax)]}
              name="ADR achievement"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              width={44}
            />
            <ZAxis type="number" dataKey="z" range={[80, 500]} />
            <ReferenceLine x={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            <Tooltip content={<QuadTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={points}>
              {points.map((p, i) => (
                <Cell key={i} fill={colorFor(p.x, p.y)} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {QUADRANTS.map((q) => (
          <span key={q.key} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: q.color }} />
            <span className="font-medium text-foreground">{q.label}</span> — {q.desc}
          </span>
        ))}
      </div>
    </div>
  );
}
