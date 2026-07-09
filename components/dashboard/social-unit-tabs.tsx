"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { MoMBadge } from "@/components/dashboard/mom-badge";
import { Sparkline } from "@/components/dashboard/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import type { SocialPlatformCard, SocialUnitData } from "@/lib/dashboard-data";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const UNIT_LABEL: Record<string, string> = { HOTEL: "Hotel", RESTAURANT: "Restaurant", SPA: "Spa" };
const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
};
const PLATFORM_COLOR: Record<string, string> = {
  INSTAGRAM: "#E1306C",
  FACEBOOK: "#1877F2",
  TIKTOK: "#111111",
  YOUTUBE: "#FF0000",
};

function PlatformCard({ card }: { card: SocialPlatformCard }) {
  const label = PLATFORM_LABEL[card.platform] ?? card.platform;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[card.platform] }} />
          {label}
        </p>
        {card.hasData ? (
          <dl className="space-y-2">
            {card.metrics.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3">
                <dt className="text-xs text-muted-foreground">{m.label}</dt>
                <dd className="flex items-center gap-2">
                  {m.trend.length > 1 && <Sparkline data={m.trend} width={56} height={18} />}
                  <span className="w-20 text-right text-sm font-medium tabular-nums text-foreground">{formatNumber(m.value)}</span>
                  <span className="w-16 text-right text-xs">
                    <MoMBadge value={m.mom} />
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No {label} data this period.</p>
        )}
      </CardContent>
    </Card>
  );
}

function UnitPanel({ unit }: { unit: SocialUnitData }) {
  if (!unit.hasData) {
    return <p className="text-sm text-muted-foreground">No social data for {UNIT_LABEL[unit.unit] ?? unit.unit} this period.</p>;
  }
  const byPlatform = (p: string) => unit.platforms.find((x) => x.platform === p);
  const ig = byPlatform("INSTAGRAM");
  const fb = byPlatform("FACEBOOK");
  const tt = byPlatform("TIKTOK");
  const yt = byPlatform("YOUTUBE");

  return (
    <div className="space-y-6">
      {unit.summary && (
        <div className="flex gap-2 rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-3 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand-gold))]" aria-hidden />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Summary · </span>
            {unit.summary}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Instagram &amp; Facebook</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          {ig && <PlatformCard card={ig} />}
          {fb && <PlatformCard card={fb} />}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">TikTok &amp; YouTube</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          {tt && <PlatformCard card={tt} />}
          {yt && <PlatformCard card={yt} />}
        </div>
      </div>
    </div>
  );
}

/** Unit-tabbed social dashboard (Hotel / Restaurant / Spa). */
export function SocialUnitTabs({ units }: { units: SocialUnitData[] }) {
  const [active, setActive] = useState(
    units.find((u) => u.hasData)?.unit ?? units[0]?.unit ?? "HOTEL",
  );
  const unit = units.find((u) => u.unit === active) ?? units[0];

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-lg border border-border p-1">
        {units.map((u) => (
          <button
            key={u.unit}
            type="button"
            onClick={() => setActive(u.unit)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === u.unit ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {UNIT_LABEL[u.unit] ?? u.unit}
          </button>
        ))}
      </div>
      {unit && <UnitPanel unit={unit} />}
    </div>
  );
}
