import { ScrapeClient } from "@/components/weekly/scrape-client";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { getRecentScrapeJobs } from "@/lib/weekly/jobs";
import { getPollerHeartbeat } from "@/lib/weekly/poller-heartbeat";
import { weekMeta } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

export default async function WeeklyScrapePage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, params.property);
  const jobs = await getRecentScrapeJobs(30);
  const heartbeat = getPollerHeartbeat();

  const meta = weekMeta(params.week);
  const defaults = {
    start: meta ? meta.startDate.toISOString().slice(0, 10) : "",
    end: meta ? meta.endDate.toISOString().slice(0, 10) : "",
    month: meta ? `${meta.year}-${String(meta.endDate.getUTCMonth() + 1).padStart(2, "0")}` : "",
    weekEnding: params.week,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Request Scrape</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ask the office PC to pull a specific VHP report for a chosen period. It runs on the next poll
          (about every 2 minutes), uploads the data automatically, and the job below shows the result.
        </p>
      </div>
      <ScrapeClient
        property={params.property}
        week={params.week}
        canEdit={canEdit}
        defaults={defaults}
        jobs={jobs}
        heartbeat={heartbeat}
      />
    </div>
  );
}
