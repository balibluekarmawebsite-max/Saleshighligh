import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { weeklyHref } from "@/lib/nav";
import { createWeek } from "@/lib/weekly/editor-actions";
import { getWeeklyReportsList } from "@/lib/weekly/editor-data";
import { currentWeekId, weekLabel } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export default async function WeeklyReportsPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const rows = await getWeeklyReportsList(params.property);
  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, params.property);
  const thisWeek = currentWeekId();
  const hasThisWeek = rows.some((r) => r.week === thisWeek);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} week{rows.length === 1 ? "" : "s"} for {params.property}
        </p>
        {canEdit && !hasThisWeek && (
          <form action={createWeek}>
            <input type="hidden" name="property" value={params.property} />
            <input type="hidden" name="week" value={thisWeek} />
            <Button type="submit" size="sm">
              <Plus /> New week — {weekLabel(thisWeek)}
            </Button>
          </form>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Week</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Sections</th>
              <th className="px-4 py-2.5 font-medium">Owner</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No weekly reports yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.week} className="hover:bg-accent/40">
                <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium capitalize text-secondary-foreground">
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.sectionsReady}/{r.sectionsTotal}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.owner ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.updatedAt}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={weeklyHref(params.property, r.week, "editor")}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
