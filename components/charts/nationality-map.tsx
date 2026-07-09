"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import worldData from "world-atlas/countries-110m.json";

import { formatNumber, formatPercent } from "@/lib/format";
import { ALPHA2_TO_NUMERIC } from "@/lib/geo";

export interface MapDatum {
  countryCode: string | null;
  countryName: string;
  roomNights: number;
  sharePct: number;
}

function lerpTeal(t: number): string {
  const light = [224, 234, 237];
  const dark = [15, 76, 92];
  const c = light.map((l, i) => Math.round(l + (dark[i]! - l) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function NationalityMap({
  data,
  selectedCode,
}: {
  data: MapDatum[];
  selectedCode: string | null;
}) {
  const [hover, setHover] = useState<MapDatum | null>(null);

  const byNumeric = new Map<string, MapDatum>();
  for (const d of data) {
    const num = d.countryCode ? ALPHA2_TO_NUMERIC[d.countryCode.toUpperCase()] : undefined;
    if (num) byNumeric.set(num, d);
  }
  const max = Math.max(1, ...data.map((d) => d.roomNights));
  const selectedNumeric = selectedCode
    ? ALPHA2_TO_NUMERIC[selectedCode.toUpperCase()]
    : null;

  return (
    <div className="relative">
      <ComposableMap
        projectionConfig={{ scale: 135 }}
        height={340}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={worldData as unknown as Record<string, unknown>}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const id = String(geo.id);
              const d = byNumeric.get(id);
              const isSelected = selectedNumeric !== null && id === selectedNumeric;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={d ? lerpTeal(d.roomNights / max) : "#EAEEF0"}
                  stroke={isSelected ? "#C9A227" : "#ffffff"}
                  strokeWidth={isSelected ? 1.6 : 0.4}
                  onMouseEnter={() => d && setHover(d)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: d ? "#C9A227" : "#DDE3E6" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hover && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-popover p-2 text-xs shadow-md">
          <p className="font-medium text-popover-foreground">{hover.countryName}</p>
          <p className="text-muted-foreground">
            {formatNumber(hover.roomNights)} RN · {formatPercent(hover.sharePct)}
          </p>
        </div>
      )}
    </div>
  );
}
