import { AlertCircle, Lock } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { AdsEditor } from "@/components/weekly/ads-editor";
import { OverviewEditor } from "@/components/weekly/overview-editor";
import { ReportProgress } from "@/components/weekly/report-progress";
import { ScreenshotManager } from "@/components/weekly/screenshot-manager";
import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { getWeeklyAds } from "@/lib/weekly/ads-data";
import { createWeek, setStatus } from "@/lib/weekly/editor-actions";
import { getWeeklyEditorData } from "@/lib/weekly/editor-data";
import { getWeeklyScreenshots } from "@/lib/weekly/screenshot-data";
import { weekLabel } from "@/lib/weekly/week";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

type StatusVariant = "default" | "secondary" | "outline";

function StatusForm({
  property,
  week,
  target,
  label,
  variant = "secondary",
}: {
  property: string;
  week: string;
  target: string;
  label: string;
  variant?: StatusVariant;
}) {
  return (
    <form action={setStatus}>
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="target" value={target} />
      <Button type="submit" variant={variant} size="sm">
        {label}
      </Button>
    </form>
  );
}

export default async function WeeklyEditorPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyEditorData(params.property, params.week);
  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, params.property);
  const admin = isAdmin(user);

  // No report yet for this week → offer to create one.
  if (!data.week) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">
          No report for this week
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {weekLabel(params.week)} doesn&apos;t have a report yet.
        </p>
        {canEdit && (
          <form action={createWeek} className="mt-4">
            <input type="hidden" name="property" value={params.property} />
            <input type="hidden" name="week" value={params.week} />
            <Button type="submit">Create this week&apos;s report</Button>
          </form>
        )}
      </div>
    );
  }

  const { week, blocks, progress } = data;
  const p = params.property;
  const w = params.week;
  const locked = week.locked;
  const screenshots = await getWeeklyScreenshots(p, w);
  const ads = await getWeeklyAds(p, w);

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Status</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
              locked
                ? "bg-variance-positive/10 text-variance-positive"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {locked && <Lock className="h-3 w-3" aria-hidden />}
            {statusLabel(week.status)}
          </span>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {week.status === "DRAFT" && (
              <StatusForm property={p} week={w} target="IN_PROGRESS" label="Start — mark In Progress" />
            )}
            {week.status === "IN_PROGRESS" && (
              <>
                <StatusForm property={p} week={w} target="READY_FOR_REVIEW" label="Submit for review" variant="default" />
                <StatusForm property={p} week={w} target="DRAFT" label="Back to Draft" variant="outline" />
              </>
            )}
            {week.status === "READY_FOR_REVIEW" && (
              <>
                {admin && (
                  <StatusForm property={p} week={w} target="APPROVED" label="Approve & lock" variant="default" />
                )}
                <StatusForm property={p} week={w} target="IN_PROGRESS" label="Back to In Progress" variant="outline" />
              </>
            )}
            {locked && admin && (
              <StatusForm property={p} week={w} target="DRAFT" label="Reopen to Draft" variant="outline" />
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SectionCard title="Sections" description="Completion for this week">
            <ReportProgress items={progress} />
          </SectionCard>
        </div>
        <div className="lg:col-span-2">
          <SectionCard
            title="A · Sales & Marketing Overview"
            description={
              locked
                ? "Approved — read only"
                : "Write the weekly commentary (saved to the report)"
            }
          >
            <OverviewEditor property={p} week={w} blocks={blocks} locked={locked} />
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="SM · Screenshots & Summaries"
        description="Upload Booking.com / social screenshots and summarise each with AI"
      >
        <ScreenshotManager property={p} week={w} locked={locked || !canEdit} screenshots={screenshots} />
      </SectionCard>

      <SectionCard
        title="Digital Ads & ROAS"
        description="Sync from the ads dashboard, or enter Google / Meta figures manually"
      >
        <AdsEditor property={p} week={w} locked={locked || !canEdit} data={ads} />
      </SectionCard>
    </div>
  );
}
