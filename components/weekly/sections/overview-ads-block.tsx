"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";

import { AdsEditor } from "@/components/weekly/ads-editor";
import { AdsOverviewBody } from "@/components/weekly/ads-overview";
import { type WeeklyAdsData } from "@/lib/weekly/ads-data";

/**
 * Section A · block 9 (ROAS / Digital Ads). Shows the SAME rich report as the
 * dashboard — summary, KPI sparklines, trend chart, Google-vs-Meta split and
 * campaigns (AdsOverviewBody) — so a weekly report reads the same here as on
 * the dashboard. Editors also get a collapsible "Sync / edit figures" panel
 * (AdsEditor: Sync now + manual entry) to refresh or correct the numbers; when
 * there is no data yet that editor panel is shown directly so it can be filled.
 */
export function OverviewAdsBlock({
  property,
  week,
  locked,
  ads,
}: {
  property: string;
  week: string;
  locked: boolean;
  ads: WeeklyAdsData;
}) {
  const [editing, setEditing] = useState(false);
  const hasData = ads.hasData && ads.blended;

  // No ads captured yet.
  if (!hasData) {
    if (locked) {
      return (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          No ads data was captured for this week.
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <AdsEditor property={property} week={week} locked={false} data={ads} />
      </div>
    );
  }

  // Data present → rich dashboard-style report, plus an optional sync/edit panel.
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <AdsOverviewBody ads={ads} />
      {!locked && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {editing ? "Hide sync & manual entry" : "Sync or edit figures"}
            {editing ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {editing && (
            <div className="mt-3 rounded-md border border-border bg-card p-3">
              <AdsEditor property={property} week={week} locked={false} data={ads} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
