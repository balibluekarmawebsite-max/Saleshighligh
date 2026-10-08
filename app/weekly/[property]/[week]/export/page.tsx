import { WeeklyExportPanel } from "@/components/weekly/export-panel";
import { getWeeklyFullEditorData } from "@/lib/weekly/editor-data";
import { weekLabel } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

export default async function WeeklyExportCenterPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyFullEditorData(params.property, params.week);
  const label = data.week?.label ?? weekLabel(params.week);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Export Center</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Download the weekly report for{" "}
          <span className="font-medium text-foreground">
            {data.week?.propertyName ?? params.property}
          </span>{" "}
          · {label}. Pick the sections and a format.
        </p>
      </div>

      {data.week ? (
        <WeeklyExportPanel property={params.property} week={params.week} />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          There&apos;s no report for {label} yet — create and fill one from Weekly Reports first.
        </div>
      )}
    </div>
  );
}
