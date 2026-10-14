"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ScrapeJobView } from "@/lib/weekly/jobs";
import type { PollerHeartbeat } from "@/lib/weekly/poller-heartbeat";
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

/** "45s ago" / "3m ago" / "2h ago". */
function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function StatusPill({ tone, label }: { tone: "green" | "amber" | "red" | "neutral"; label: string }) {
  const dot = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", neutral: "bg-slate-300" }[tone];
  const text = { green: "text-emerald-700", amber: "text-amber-700", red: "text-red-700", neutral: "text-muted-foreground" }[tone];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot} ${tone === "green" ? "animate-pulse" : ""}`} />
      <span className={text}>{label}</span>
    </div>
  );
}

/**
 * Live "is the office-PC poller alive?" badge. The poller polls ~every 2 min, so
 * a heartbeat older than a few minutes means it isn't running (or is sending the
 * wrong token, so claim 401s and it never gets a job — leaving requests stuck in
 * "queued"). `now` is null until mounted to avoid a hydration mismatch on the
 * client clock.
 */
function PollerStatus({ heartbeat, now }: { heartbeat: PollerHeartbeat | null; now: number | null }) {
  if (now === null) return <StatusPill tone="neutral" label="Checking poller status…" />;
  if (!heartbeat) {
    return (
      <StatusPill
        tone="red"
        label="Poller offline — no poll since the server last started. Is the office-PC poller running, with the right token?"
      />
    );
  }
  const age = Math.max(0, now - heartbeat.at);
  const who = heartbeat.worker ? ` (${heartbeat.worker})` : "";
  if (age <= 3 * 60_000) return <StatusPill tone="green" label={`Poller online${who} · last seen ${ago(age)}`} />;
  if (age <= 10 * 60_000)
    return <StatusPill tone="amber" label={`Poller last seen ${ago(age)}${who} — expected a poll every ~2 min`} />;
  return (
    <StatusPill
      tone="red"
      label={`Poller offline — last seen ${ago(age)}${who}. Is it running, with the right token?`}
    />
  );
}

export function ScrapeClient({
  property,
  week,
  canEdit,
  defaults,
  jobs,
  heartbeat,
}: {
  property: string;
  week: string;
  canEdit: boolean;
  defaults: { start: string; end: string; month: string; weekEnding: string };
  jobs: ScrapeJobView[];
  heartbeat: PollerHeartbeat | null;
}) {
  const [state, formAction] = useFormState<ScrapeActionResult | null, FormData>(requestScrape, null);
  const [section, setSection] = useState<"C" | "B">("C");
  const [now, setNow] = useState<number | null>(null);
  const router = useRouter();

  // Keep the job list fresh so queued → running → done/failed shows live, and
  // tick a local clock so the poller "last seen" age stays current.
  useEffect(() => {
    setNow(Date.now());
    const refresh = setInterval(() => router.refresh(), 8000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, [router]);

  return (
    <div className="space-y-6">
      {/* ── Poller status ────────────────────────────────────────────── */}
      <PollerStatus heartbeat={heartbeat} now={now} />

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
              : "The scraper sets VHP's Month selector to this month, opens the Yearly Forecast (Show Revenue on) and uploads Section B. Pick the current month to refresh, or a past month to backfill — VHP fills that month through to year-end."}
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
