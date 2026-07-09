import { notFound } from "next/navigation";
import { Images } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PlanSectionPanel } from "@/components/dashboard/plan-section-panel";
import { SectionCard } from "@/components/dashboard/section-card";
import { GROUP_CODE, getPlansPageData } from "@/lib/dashboard-data";
import { periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const CONSORTIA_PARTNERS = ["Viator", "Bali.com", "Classpass", "Klook"];

export default async function PlansPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Action Plans & Promotions" description="Consolidated view coming soon." />;
  }

  const data = await getPlansPageData(params.property, params.period);
  if (!data) notFound();
  if (!data.hasData) {
    return (
      <EmptyState
        title={`No period for ${params.property} · ${periodLabel(params.period)}`}
        message="Create the report period (via import) before authoring action plans and promotions."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const { property, sections } = data;
  const panel = (section: string, emptyText?: string) => (
    <PlanSectionPanel
      blocks={sections[section]!}
      section={section}
      property={params.property}
      period={params.period}
      emptyText={emptyText}
    />
  );

  const promoUnits = [
    { key: "ROOMS", label: "Rooms" },
    { key: "RESTAURANT", label: property.restaurantName },
    { key: "SPA", label: property.spaName },
    { key: "WELLNESS", label: "Wellness" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{property.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Action Plans, PR &amp; Promotions · {periodLabel(params.period)}</p>
      </div>

      <SectionCard title="Sales & Marketing Action Plan" description="Priorities and owners for the month ahead">
        {panel("ACTION_PLAN", "No action plan written for this period yet.")}
      </SectionCard>

      <SectionCard title="Sales Strategy per Segment" description="Segment-level plays — OTA, corporate, wholesale, direct, wellness">
        {panel("SALES_STRATEGY", "No segment strategy written for this period yet.")}
      </SectionCard>

      <SectionCard title="Marketing Plan" description="Campaigns, channels and budget focus">
        {panel("MARKETING_PLAN", "No marketing plan written for this period yet.")}
      </SectionCard>

      <SectionCard title="Social Media Plan" description="Content pillars and posting cadence">
        {panel("SOCIAL_PLAN", "No social plan written for this period yet.")}
      </SectionCard>

      <SectionCard title="Consortia & Partners" description="OTA and experience partners">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CONSORTIA_PARTNERS.map((p) => (
            <div key={p} className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold text-foreground">{p}</p>
              <p className="mt-1 text-xs text-muted-foreground">Partner status &amp; performance — add details in a later phase.</p>
            </div>
          ))}
        </div>
        {panel("CONSORTIA", "No consortia notes written for this period yet.")}
      </SectionCard>

      <SectionCard title="Magazine" description="Print &amp; digital magazine features">
        {panel("MAGAZINE", "No magazine features recorded for this period yet.")}
      </SectionCard>

      <SectionCard title="Media Features & PR" description="Press coverage — outlet + link">
        {panel("PR", "No media features recorded for this period yet.")}
      </SectionCard>

      <SectionCard title="Ongoing Promotions" description="Active offers by unit — image galleries">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {promoUnits.map((u) => (
            <div key={u.key} className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold text-foreground">{u.label}</p>
              <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-border bg-secondary/40">
                <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                  <Images className="h-5 w-5" aria-hidden />
                  Promo images
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Image upload &amp; drag-to-reorder arrive with the admin/auth phase.</p>
        {panel("PROMOTIONS", "No promotions written for this period yet.")}
      </SectionCard>
    </div>
  );
}
