import { RescrapeButton, RunCheckButton } from "@/components/monitor/scraper-actions";
import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { isSmtpConfigured } from "@/lib/daily/mailer";
import { DAILY_FEEDS } from "@/lib/monitor/feeds";
import type { FeedStatus } from "@/lib/monitor/health-logic";
import { getScraperHealth } from "@/lib/monitor/ingestion-health";

export const dynamic = "force-dynamic";

/** UTC ISO → Bali (WITA, UTC+8) wall-clock, e.g. "9 Nov 2026, 07:00 WITA". */
function witaStamp(iso: string): string {
  const w = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const date = w.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = w.toISOString().slice(11, 16);
  return `${date}, ${time} WITA`;
}

const STATUS_META: Record<FeedStatus, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-variance-positive/10 text-variance-positive" },
  stale: { label: "Stale", cls: "bg-[hsl(var(--brand-gold))]/20 text-foreground" },
  missing: { label: "Missing", cls: "bg-variance-negative/10 text-variance-negative" },
};

function StatusChip({ status }: { status: FeedStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

const JOB_STATUS_CLS: Record<string, string> = {
  done: "text-variance-positive",
  failed: "text-variance-negative",
  running: "text-brand-teal",
  queued: "text-muted-foreground",
};

export default async function ScraperHealthPage() {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN" && me?.role !== "EDITOR") {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Restricted</p>
        <p className="mt-1 text-sm text-muted-foreground">Scraper Health is visible to editors and admins.</p>
      </div>
    );
  }

  const admin = isAdmin(me);
  const h = await getScraperHealth();
  const props = h.freshness.map((f) => f.property);
  const criticalGaps = h.criticalGapKeys.length;
  const totalGaps = h.openGapKeys.length;
  const emailReady = isSmtpConfigured();
  const autoRecoverOn = /^(1|true|yes|on)$/i.test(process.env.SCRAPER_AUTO_RECOVER ?? "");
  const queueConfigured = h.weekly.configured.scrapeQueue;

  const banner =
    criticalGaps > 0
      ? { tone: "bad", text: `${criticalGaps} critical feed${criticalGaps === 1 ? "" : "s"} did not arrive for ${h.todayWita}.` }
      : totalGaps > 0
        ? { tone: "warn", text: `${totalGaps} secondary feed${totalGaps === 1 ? "" : "s"} missing for ${h.todayWita}; critical feeds are OK.` }
        : { tone: "good", text: `All daily feeds arrived for ${h.todayWita}.` };

  const bannerClass =
    banner.tone === "good"
      ? "border-variance-positive/30 bg-variance-positive/10 text-variance-positive"
      : banner.tone === "bad"
        ? "border-variance-negative/30 bg-variance-negative/10 text-variance-negative"
        : "border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/10 text-foreground";

  const feedFor = (code: string, feedKey: string) =>
    h.dailyFeeds.find((d) => d.property === code && d.feed === feedKey) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Scraper Health</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every VHP / API feed we ingest, recorded as it arrives. If a feed doesn&apos;t land in the morning, the team is
          emailed and — when auto-recover is on — a re-pull is queued for the office-PC scraper.
        </p>
      </div>

      <div className={`rounded-lg border p-4 text-sm font-medium ${bannerClass}`}>{banner.text}</div>

      {/* Daily feed matrix */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Daily feeds · {h.todayWita}</h3>
          <span className="text-xs text-muted-foreground">Expected after the ~07:00 WITA pull</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2 text-left">Feed</th>
                {props.map((p) => (
                  <th key={p} className="px-3 py-2 text-left">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAILY_FEEDS.map((feed) => (
                <tr key={feed.key} className="border-b border-border/60 align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">
                      {feed.label}
                      {feed.critical ? (
                        <span className="ml-2 rounded bg-brand-teal/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-teal">
                          critical
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{feed.note}</div>
                  </td>
                  {props.map((code) => {
                    const fh = feedFor(code, feed.key);
                    return (
                      <td key={code} className="px-3 py-2.5">
                        {fh ? (
                          <>
                            <StatusChip status={fh.status} />
                            <div className="mt-1 text-xs text-muted-foreground">
                              {fh.status === "ok" ? "arrived " : "last "}
                              {fh.lastPushAgeLabel}
                              {fh.lastRows != null ? ` · ${fh.lastRows} rows` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Occupancy data freshness */}
              <tr className="align-top">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-foreground">Latest occupancy data date</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Newest stored snapshot vs. yesterday ({h.yesterdayWita})</div>
                </td>
                {props.map((code) => {
                  const f = h.freshness.find((x) => x.property === code);
                  return (
                    <td key={code} className="px-3 py-2.5">
                      <span className={f?.dataCurrent ? "text-variance-positive" : "text-variance-negative"}>
                        {f?.latestSnapshotDate ?? "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {admin && queueConfigured ? (
          <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-border pt-4">
            <span className="pt-1 text-xs font-medium text-muted-foreground">Request a daily re-pull:</span>
            {props.map((p) => (
              <RescrapeButton key={p} property={p} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Config + actions */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Check &amp; configuration</h3>
          <div className="mt-2 divide-y divide-border/60">
            <Row label="Schedule" value="Daily at 09:00 WITA" />
            <Row label="Cron secret" value={process.env.CRON_SECRET ? "Set" : <span className="text-variance-negative">Missing</span>} />
            <Row
              label="Alert email"
              value={emailReady ? "Uses Daily Report recipients" : <span className="text-variance-negative">SMTP not set</span>}
            />
            <Row
              label="Auto re-pull"
              value={
                autoRecoverOn ? (
                  <span className="text-variance-positive">On</span>
                ) : (
                  <span className="text-muted-foreground">Off</span>
                )
              }
            />
            <Row
              label="Scrape queue"
              value={queueConfigured ? "Configured" : <span className="text-variance-negative">Not configured</span>}
            />
            <Row
              label="Office-PC poller"
              value={
                h.poller.seenAt ? (
                  <span className={h.poller.aliveRecently ? "text-variance-positive" : "text-muted-foreground"}>
                    {h.poller.worker ?? "poller"} · {h.poller.ageLabel}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No poll since restart</span>
                )
              }
            />
          </div>
          {admin ? (
            <div className="mt-4 border-t border-border pt-4">
              <RunCheckButton />
              <p className="mt-2 text-xs text-muted-foreground">
                Runs the same check the 09:00 timer does: records gaps, emails new ones, and (if auto-recover is on)
                queues re-pulls.
              </p>
            </div>
          ) : null}
        </div>

        {/* Weekly sync */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Weekly auto-sync</h3>
          <div className="mt-2 divide-y divide-border/60">
            <Row label="Last run" value={h.weekly.lastRunAt ? witaStamp(h.weekly.lastRunAt) : "—"} />
            <Row
              label="Covers current week"
              value={
                h.weekly.lastRunWeek
                  ? h.weekly.coversCurrentWeek
                    ? <span className="text-variance-positive">Yes ({h.weekly.lastRunWeek})</span>
                    : <span className="text-variance-negative">No (last {h.weekly.lastRunWeek})</span>
                  : "—"
              }
            />
            <Row label="Metricool" value={h.weekly.configured.metricool ? "Configured" : "Off"} />
            <Row label="Ads / ROAS" value={h.weekly.configured.ads ? "Configured" : "Off"} />
          </div>
          {h.weekly.perProperty.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {h.weekly.perProperty.map((p) => (
                <div key={p.property} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{p.property}</span>
                  <span className="text-muted-foreground">
                    {p.metricoolRows != null ? `${p.metricoolRows} social` : "—"}
                    {" · "}
                    {p.adsRows != null ? `${p.adsRows} ads` : "—"}
                    {p.scrapeQueued.length ? ` · scrape ${p.scrapeQueued.join("/")}` : ""}
                    {p.errors.length ? <span className="text-variance-negative"> · {p.errors.length} error(s)</span> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Recent scrape jobs */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Recent scrape-queue jobs</h3>
        {h.recentJobs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No scrape jobs yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2 text-left">Requested</th>
                  <th className="px-3 py-2 text-left">Property</th>
                  <th className="px-3 py-2 text-left">Section</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {h.recentJobs.map((j) => (
                  <tr key={j.id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{witaStamp(j.requestedAt)}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{j.property}</td>
                    <td className="px-3 py-2 text-muted-foreground">{j.section}</td>
                    <td className="px-3 py-2 text-muted-foreground">{j.period}</td>
                    <td className={`px-3 py-2 font-medium ${JOB_STATUS_CLS[j.status] ?? "text-muted-foreground"}`}>{j.status}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {j.message ?? (j.written != null ? `${j.written} rows` : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent check runs */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Recent health checks</h3>
        {h.recentRuns.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No check has run yet. The first record appears after the 09:00 WITA job (or “Run check now”).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Trigger</th>
                  <th className="px-3 py-2 text-right">Open gaps</th>
                  <th className="px-3 py-2 text-right">New</th>
                  <th className="px-3 py-2 text-right">Re-pulls</th>
                  <th className="px-3 py-2 text-left">Email</th>
                </tr>
              </thead>
              <tbody>
                {h.recentRuns.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{witaStamp(r.ranAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.trigger}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.openGaps.length}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.newGaps.length}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {r.recovered.filter((x) => x.jobId).length || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.emailSent ? (
                        <span className="text-variance-positive">sent</span>
                      ) : r.emailError ? (
                        <span className="text-variance-negative">{r.emailError}</span>
                      ) : (
                        "—"
                      )}
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
