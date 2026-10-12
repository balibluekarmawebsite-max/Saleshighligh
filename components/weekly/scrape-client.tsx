"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ScrapeJobView } from "@/lib/weekly/jobs";
import { requestScrape, type ScrapeActionResult } from "@/app/weekly/[property]/[week]/scrape/actions";

const PROPERTY_CODES = ["BKDS", "BKDU", "BKV"] as const;

const FIELD =
  "w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-600",
  running: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Requesting…" : "Request scrape"}
    </Button>
  );
}

export function ScrapeClient({
  property,
  week,
  canEdit,
  defaults,
  jobs,
}: {
  property: string;
  week: string;
  canEdit: boolean;
  defaults: { start: string; end: string; month: string; weekEnding: string };
  jobs: ScrapeJobView[];
}) {
  const [state, formAction] = useFormState<ScrapeActionResult | null, FormData>(requestScrape, null);
  const [section, setSection] = useState<"C" | "B">("C");
  const router = useRouter();

  // Keep the job list fresh so queued → running → done/failed shows live.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="space-y-6">
      {/* ── Request form ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="week" value={week} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Property</span>
              <select name="property" defaultValue={property} disabled={!canEdit} className={FIELD}>
                {PROPERTY_CODES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Report</span>
              <select
                name="section"
                value={section}
                onChange={(e) => setSection(e.target.value as "C" | "B")}
                disabled={!canEdit}
                className={FIELD}
              >
                <option value="C">C — Reservation by Creation Date (by booking agent)</option>
                <option value="B">B — Yearly Forecast of Room Occupancy</option>
              </select>
            </label>
          </div>

          {section === "C" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">From</span>
                <input type="date" name="start" defaultValue={defaults.start} disabled={!canEdit} className={FIELD} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">To</span>
                <input type="date" name="end" defaultValue={defaults.end} disabled={!canEdit} className={FIELD} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Fills week (Thu)</span>
                <input type="date" name="week_ending" defaultValue={defaults.weekEnding} disabled={!canEdit} className={FIELD} />
              </label>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Month</span>
                <input type="month" name="month" defaultValue={defaults.month} disabled={!canEdit} className={FIELD} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Fills week (Thu)</span>
                <input type="date" name="week_ending" defaultValue={defaults.weekEnding} disabled={!canEdit} className={FIELD} />
              </label>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {section === "C"
              ? "The scraper sets VHP's reservation date filter to exactly this range, exports, and uploads Section C."
              : "The scraper opens the Yearly Forecast for this month (Show Revenue on) and uploads Section B. Pick the current or a future month — past-month backfill isn't supported by the scraper yet."}
          </p>

          <div className="flex items-center gap-3">
            {canEdit ? <SubmitButton /> : <span className="text-sm text-muted-foreground">You don&apos;t have access to request a scrape.</span>}
            {state?.ok && (
              <span className="flex items-center gap-1 text-sm text-variance-positive">
                <Check className="h-4 w-4" /> {state.message}
              </span>
            )}
            {state && !state.ok && <span className="text-sm text-variance-negative">{state.message}</span>}
          </div>
        </form>
      </div>

      {/* ── Job list ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-foreground">Recent requests</h2>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No scrape requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Property</th>
                  <th className="py-2 px-3">Report</th>
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Detail</th>
                  <th className="py-2 pl-3 text-right">Requested</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium text-foreground">{j.property}</td>
                    <td className="py-2 px-3">{j.section}</td>
                    <td className="py-2 px-3 tabular-nums text-muted-foreground">{j.period}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[j.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {j.message ?? "—"}
                      {j.written != null && <span className="ml-1 text-xs">({j.written} rows)</span>}
                    </td>
                    <td className="py-2 pl-3 text-right text-xs tabular-nums text-muted-foreground">
                      {new Date(j.requestedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
