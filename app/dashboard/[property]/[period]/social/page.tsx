import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SectionCard } from "@/components/dashboard/section-card";
import { SocialUnitTabs } from "@/components/dashboard/social-unit-tabs";
import { InfluencerUploader } from "@/components/sales/influencer-uploader";
import { SocialSyncPanel, type UnitBrandInit } from "@/components/sales/social-sync-panel";
import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { GROUP_CODE, getSocialPageData, type InfluencerRow } from "@/lib/dashboard-data";
import { formatNumber } from "@/lib/format";
import { periodLabel } from "@/lib/labels";
import { getUnitBlogId, isMetricoolConfigured } from "@/lib/weekly/metricool";

export const dynamic = "force-dynamic";

const SYNC_UNITS: UnitBrandInit["unit"][] = ["HOTEL", "RESTAURANT", "SPA"];

/** Compact follower count, e.g. 12,400 → "12.4K". */
function compactFollowers(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatNumber(n);
}

/** One influencer collaboration as a card: the original screenshot + its details. */
function InfluencerCard({ inf }: { inf: InfluencerRow }) {
  const clean = inf.handle.replace(/^@/, "");
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {inf.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={inf.imageUrl} alt={inf.name} className="max-h-80 w-full bg-secondary/20 object-contain" />
      )}
      <div className="space-y-1 p-4">
        <p className="font-semibold text-foreground">{inf.name}</p>
        <a
          href={`https://instagram.com/${clean}`}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-primary hover:underline"
        >
          @{clean}
        </a>
        <p className="text-xs text-muted-foreground">
          Followers: {compactFollowers(inf.followers)}
          {inf.origin && inf.origin !== "—" ? ` · Origin: ${inf.origin}` : ""}
        </p>
        {inf.notes && <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{inf.notes}</p>}
      </div>
    </div>
  );
}

export default async function SocialPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Social Media & PR" description="Consolidated view coming soon." />;
  }

  const data = await getSocialPageData(params.property, params.period);
  if (!data) notFound();

  // Editor/admin Metricool sync controls (also shown on the empty state so an
  // editor can populate the page). Resolve each unit's assigned brand.
  const me = await getCurrentUser();
  const canEdit = canEditProperty(me, params.property);
  const admin = isAdmin(me);
  const configured = isMetricoolConfigured();
  const brands: UnitBrandInit[] = canEdit
    ? await Promise.all(
        SYNC_UNITS.map(async (unit) => ({ unit, blogId: await getUnitBlogId(params.property, unit) })),
      )
    : [];

  const syncPanel = canEdit ? (
    <SocialSyncPanel
      property={params.property}
      period={params.period}
      brands={brands}
      configured={configured}
      isAdmin={admin}
    />
  ) : null;

  if (!data.hasData) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {syncPanel}
        <EmptyState
          title={`No data for ${params.property} · ${periodLabel(params.period)}`}
          message="Sync from Metricool above, or import the monthly workbook (SOCIAL / INFLUENCER tabs)."
          actionHref="/admin/import"
          actionLabel="Import data"
        />
      </div>
    );
  }

  const { property, units, influencers } = data;
  const anySocial = units.some((u) => u.hasData);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{property.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Social Media &amp; PR · {periodLabel(params.period)}</p>
        </div>
        {syncPanel}
      </div>

      {/* Organic social by unit */}
      <SectionCard
        title="Organic Social"
        description="Instagram, Facebook, TikTok & YouTube by business unit — each metric vs last month with a 6-month trend"
      >
        {anySocial ? (
          <SocialUnitTabs units={units} />
        ) : (
          <p className="text-sm text-muted-foreground">No social metrics for this period yet.</p>
        )}
      </SectionCard>

      {/* Influencer collaborations */}
      <SectionCard title="Influencer Collaborations" description="Creators hosted or partnered with this month — screenshot + a short summary">
        {canEdit && (
          <div className="mb-4">
            <InfluencerUploader property={params.property} period={params.period} entries={influencers} />
          </div>
        )}
        {influencers.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {influencers.map((inf) => (
              <InfluencerCard key={inf.id} inf={inf} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? "No collaborations yet — add one above."
              : "No influencer collaborations recorded for this period yet."}
          </p>
        )}
      </SectionCard>
    </div>
  );
}
