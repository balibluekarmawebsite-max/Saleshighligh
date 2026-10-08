import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DeleteWeekButton } from "@/components/weekly/delete-week-button";
import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { weeklyHref } from "@/lib/nav";
import { createWeek } from "@/lib/weekly/editor-actions";
import { getWeeklyReportsList, isLockedStatus } from "@/lib/weekly/editor-data";
import { currentWeekId, weekLabel } from "@/lib/weekly/week";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-secondary text-secondary-foreground",
  IN_PROGRESS: "bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))]",
  READY_FOR_REVIEW: "bg-blue-100 text-blue-700",
  APPROVED: "bg-variance-positive/10 text-variance-positive",
  EXPORTED: "bg-primary/10 text-primary",
};

export default async function WeeklyReportsPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const rows = await getWeeklyReportsList(params.property);
  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, params.property);
  const admin = isAdmin(user);
  const thisWeek = currentWeekId();
  const hasThisWeek = rows.some((r) => r.week === thisWeek);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Weekly Reports</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.length} week{rows.length === 1 ? "" : "s"} for {params.property}
          </p>
        </div>
        {canEdit && (
          hasThisWeek ? (
            <Link href={weeklyHref(params.property, thisWeek, "editor")}>
              <Button size="sm" variant="outline">
                Open this week
              </Button>
            </Link>
          ) : (
            <form action={createWeek}>
              <input type="hidden" name="property" value={params.property} />
              <input type="hidden" name="week" value={thisWeek} />
              <Button type="submit" size="sm">
                <Plus /> New week — {weekLabel(thisWeek)}
              </Button>
            </form>
          )
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Week</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last edited</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No weekly reports yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const canDelete = canEdit && (admin || !isLockedStatus(r.status));
              return (
                <tr key={r.week} className="hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    W{r.weekNumber} · {r.year}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.owner ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_STYLES[r.status] ?? "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.updatedAtRelative}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-4">
                      <Link
                        href={weeklyHref(params.property, r.week, "editor")}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Open <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      {canDelete && (
                        <DeleteWeekButton property={params.property} week={r.week} label={r.label} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
