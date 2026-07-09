import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SectionCard } from "@/components/dashboard/section-card";
import { SocialUnitTabs } from "@/components/dashboard/social-unit-tabs";
import { GROUP_CODE, getSocialPageData } from "@/lib/dashboard-data";
import { formatNumber } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

/** Compact follower count, e.g. 12,400 → "12.4K". */
function compactFollowers(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatNumber(n);
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
  if (!data.hasData) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook (SOCIAL / INFLUENCER tabs) to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const { property, units, influencers } = data;
  const anySocial = units.some((u) => u.hasData);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{property.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Social Media &amp; PR · {periodLabel(params.period)}</p>
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
      <SectionCard title="Influencer Collaborations" description="Creators hosted or partnered with this month">
        {influencers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2 text-left">Handle</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-right">Followers</th>
                  <th className="px-3 py-2 text-left">Origin</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((inf) => {
                  const clean = inf.handle.replace(/^@/, "");
                  return (
                    <tr key={inf.handle} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium">
                        <a
                          href={`https://instagram.com/${clean}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary hover:underline"
                        >
                          @{clean}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-foreground">{inf.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{compactFollowers(inf.followers)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{inf.origin}</td>
                      <td className="px-3 py-2 text-muted-foreground">{inf.notes ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No influencer collaborations recorded for this period yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
