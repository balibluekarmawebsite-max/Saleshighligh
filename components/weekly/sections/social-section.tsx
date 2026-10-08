"use client";

import { ActivitiesCards } from "@/components/weekly/sections/activities-cards";
import { GraphicDesignTable } from "@/components/weekly/sections/graphic-design-table";
import { MetricoolSyncPanel } from "@/components/weekly/sections/metricool-sync-panel";
import { SocialGrid } from "@/components/weekly/sections/social-grid";
import { SocialNarrative } from "@/components/weekly/sections/social-narrative";
import { SM_ACTIVITY_SECTIONS, type WeeklyEditorBlock } from "@/lib/weekly/editor-data";
import type { MetricoolSyncResult } from "@/lib/weekly/metricool-sync";
import type { Row } from "@/components/weekly/sections/shared";

/** Section H — Social Media Insight: metrics + summary + graphic design + activity logs. */
export function SocialSection({
  property,
  week,
  locked,
  social,
  socialNarrative,
  graphicDesign,
  activityRows,
  metricoolConfigured,
  metricoolBlogId,
  metricoolMeta,
}: {
  property: string;
  week: string;
  locked: boolean;
  social: Record<string, Record<string, { lastWeek: string; thisWeek: string }>>;
  socialNarrative: WeeklyEditorBlock[];
  graphicDesign: Row[];
  activityRows: Record<string, Row[]>;
  metricoolConfigured: boolean;
  metricoolBlogId: string | null;
  metricoolMeta: MetricoolSyncResult | null;
}) {
  return (
    <div className="space-y-6">
      <MetricoolSyncPanel
        property={property}
        week={week}
        locked={locked}
        configured={metricoolConfigured}
        blogId={metricoolBlogId}
        initialMeta={metricoolMeta}
      />
      <SocialGrid property={property} week={week} locked={locked} initial={social} />
      <SocialNarrative property={property} week={week} locked={locked} blocks={socialNarrative} />
      <GraphicDesignTable property={property} week={week} locked={locked} initial={graphicDesign} />
      {SM_ACTIVITY_SECTIONS.map((s) => (
        <ActivitiesCards
          key={s.id}
          property={property}
          week={week}
          locked={locked}
          sectionId={s.id}
          title={s.title}
          subtitle="Add each activity with its date and notes."
          subjectLabel={s.subjectLabel}
          addLabel={s.addLabel}
          initial={activityRows[s.id] ?? []}
        />
      ))}
    </div>
  );
}
