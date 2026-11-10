/**
 * The scraper-health check: compute ingestion health, de-duplicate against the
 * previous run today, auto-queue a re-pull for any property missing a critical
 * feed (when enabled), email the team once per newly-detected gap, and record
 * the run. Driven by the /api/cron/scraper-check route (daily) and the "Run
 * check now" admin action. Never throws into the caller.
 */

import { logAudit } from "@/lib/audit";
import { isSmtpConfigured, sendMail } from "@/lib/daily/mailer";
import { getDailyRecipientEmails } from "@/lib/daily/recipients";
import { DAILY_FEEDS } from "@/lib/monitor/feeds";
import { diffNewGaps, isGap, parseGapKey } from "@/lib/monitor/health-logic";
import { getScraperHealth, type ScraperHealth } from "@/lib/monitor/ingestion-health";
import { enqueueDailyRescrape, isAutoRecoverEnabled, type RescrapeOutcome } from "@/lib/monitor/rescrape";
import { getAlertedGapKeysForDate, recordCheckRun } from "@/lib/monitor/runs";

export interface ScraperCheckOutcome {
  ranAt: string;
  dateWita: string;
  trigger: string;
  openGaps: string[];
  newGaps: string[];
  recovered: RescrapeOutcome[];
  emailSent: boolean;
  emailError: string | null;
  autoRecover: boolean;
  /** The full snapshot (for a manual run's response / the page). */
  health: ScraperHealth;
}

const TEAL = "#0F4C5C";
const GOLD = "#C9A227";
const RED = "#B91C1C";

const feedCritical = (key: string): boolean => DAILY_FEEDS.find((f) => f.key === key)?.critical ?? false;

/** Base URL for a link into the app, when configured. */
function appBase(): string {
  return (process.env.NEXTAUTH_URL || process.env.AUTH_URL || process.env.APP_URL || "").replace(/\/+$/, "");
}

interface AlertEmail {
  subject: string;
  html: string;
  text: string;
}

/** Build the alert email from the current health + the gap keys that triggered it. */
function buildAlertEmail(health: ScraperHealth, triggerGaps: string[], recovered: RescrapeOutcome[]): AlertEmail {
  // All currently-open gap feeds (not just the new ones) — the full problem set.
  const gapFeeds = health.dailyFeeds.filter((f) => isGap(f.status));
  const n = triggerGaps.length;
  const criticalCount = triggerGaps.filter((k) => {
    const p = parseGapKey(k);
    return p ? feedCritical(p.feed) : false;
  }).length;

  const subject = `⚠️ Scraper alert — ${n} feed${n === 1 ? "" : "s"} missing · BK Daily (${health.todayWita})`;

  const queuedCodes = [...new Set(recovered.filter((r) => r.jobId).map((r) => r.key.split(":")[0]))];
  const recoveryLine = queuedCodes.length
    ? `A re-pull was automatically queued for: ${queuedCodes.join(", ")}. The office-PC scraper will pick it up on its next poll.`
    : isAutoRecoverEnabled()
      ? "Auto re-pull is on, but nothing could be queued (the scrape queue may not be configured). Check the office-PC scraper."
      : "Auto re-pull is off. Queue a re-pull from Admin → Scraper Health, or check the office-PC scraper.";

  const base = appBase();
  const link = base ? `${base}/admin/scraper` : null;

  // ── Plain text ───────────────────────────────────────────────────────────
  const textRows = gapFeeds
    .map((f) => `  • ${f.property} — ${f.feedLabel}${f.critical ? " (critical)" : ""}: last received ${f.lastPushAgeLabel}`)
    .join("\n");
  const text = [
    `Scraper health alert — ${health.todayWita}`,
    "",
    `${n} data feed${n === 1 ? "" : "s"} did not arrive for today${criticalCount ? ` (${criticalCount} critical)` : ""}.`,
    `The morning VHP pull is expected by ~07:00 WITA.`,
    "",
    "Missing feeds:",
    textRows || "  (none)",
    "",
    recoveryLine,
    link ? `\nOpen the monitor: ${link}` : "",
    "",
    "— BK Dashboard automated scraper monitor",
  ].join("\n");

  // ── HTML ─────────────────────────────────────────────────────────────────
  const rowsHtml = gapFeeds
    .map((f) => {
      const badge = f.critical
        ? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:${RED};color:#fff;font-size:11px;">critical</span>`
        : "";
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:600;color:${TEAL};">${f.property}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#111;">${f.feedLabel}${badge}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#6b7280;white-space:nowrap;">${f.lastPushAgeLabel}</td>
      </tr>`;
    })
    .join("");

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;">
    <div style="background:${TEAL};color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <div style="font-size:18px;font-weight:700;">⚠️ Scraper health alert</div>
      <div style="font-size:13px;opacity:.85;margin-top:2px;">${health.todayWita} · ${n} feed${n === 1 ? "" : "s"} missing${criticalCount ? ` · ${criticalCount} critical` : ""}</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px;">
      <p style="margin:0 0 14px;font-size:14px;line-height:1.5;">
        The daily VHP pull is expected by about <strong>07:00 WITA</strong>. The feed${n === 1 ? "" : "s"} below
        have not arrived for <strong>${health.todayWita}</strong>:
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.03em;">
            <th style="padding:8px 10px;text-align:left;">Property</th>
            <th style="padding:8px 10px;text-align:left;">Feed</th>
            <th style="padding:8px 10px;text-align:left;">Last received</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;padding:10px 12px;background:#fffbeb;border-left:3px solid ${GOLD};border-radius:4px;">
        ${recoveryLine}
      </p>
      ${link ? `<p style="margin:16px 0 0;"><a href="${link}" style="display:inline-block;background:${TEAL};color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-size:14px;">Open Scraper Health</a></p>` : ""}
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">— BK Dashboard automated scraper monitor</p>
    </div>
  </div>`;

  return { subject, html, text };
}

async function sendScraperAlert(
  health: ScraperHealth,
  newGaps: string[],
  recovered: RescrapeOutcome[],
): Promise<{ sent: boolean; error: string | null }> {
  if (!isSmtpConfigured()) return { sent: false, error: "SMTP not configured" };
  const to = await getDailyRecipientEmails();
  if (to.length === 0) return { sent: false, error: "no recipients configured" };

  const { subject, html, text } = buildAlertEmail(health, newGaps, recovered);
  try {
    await sendMail({ to, subject, html, text });
    await logAudit("scraper_alert", subject, {
      to,
      gaps: newGaps,
      recovered: recovered.filter((r) => r.jobId).map((r) => r.jobId),
    }).catch(() => {});
    return { sent: true, error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : "send failed";
    await logAudit("scraper_alert", "(failed)", { error, gaps: newGaps }).catch(() => {});
    return { sent: false, error };
  }
}

/**
 * Run the scraper-health check. `trigger` tags the run; `autoRecover` overrides
 * the env default (used by the manual admin action). `nowMs` is injectable.
 */
export async function runScraperCheck(
  opts: { trigger?: "cron" | "manual"; autoRecover?: boolean; nowMs?: number } = {},
): Promise<ScraperCheckOutcome> {
  const nowMs = opts.nowMs ?? Date.now();
  const trigger = opts.trigger ?? "cron";
  const autoRecover = opts.autoRecover ?? isAutoRecoverEnabled();

  const health = await getScraperHealth(nowMs);
  const { todayWita, yesterdayWita, openGapKeys } = health;

  // A gap is alert-worthy until an alert for it has actually gone out today, so
  // we de-dup against gaps already SUCCESSFULLY emailed (not merely observed):
  // an early/manual run that recorded gaps without emailing doesn't suppress the
  // real alert, and a failed send is retried on the next run.
  const alreadyAlerted = await getAlertedGapKeysForDate(todayWita);
  const newGaps = diffNewGaps(openGapKeys, alreadyAlerted);

  // Auto-recover: one targeted re-pull per missing feed (not the whole pull), so
  // a single stale feed re-pulls just that feed. The re-pull targets yesterday
  // (the day a morning pull reflects); enqueue is idempotent per property+feed.
  const recovered: RescrapeOutcome[] = [];
  if (autoRecover && openGapKeys.length > 0) {
    for (const k of openGapKeys) {
      const p = parseGapKey(k);
      if (!p) continue;
      recovered.push(await enqueueDailyRescrape(p.property, yesterdayWita, p.feed));
    }
  }

  // Email only when something is newly broken this day.
  let emailSent = false;
  let emailError: string | null = null;
  if (newGaps.length > 0) {
    const r = await sendScraperAlert(health, newGaps, recovered);
    emailSent = r.sent;
    emailError = r.error;
  }

  await recordCheckRun({
    trigger,
    dateWita: todayWita,
    openGaps: openGapKeys,
    newGaps,
    recovered,
    emailSent,
    emailError,
  });

  await logAudit("scraper_check", todayWita, {
    trigger,
    openGaps: openGapKeys.length,
    newGaps: newGaps.length,
    queued: recovered.filter((r) => r.jobId).length,
    emailSent,
    emailError,
  }).catch(() => {});

  return {
    ranAt: new Date(nowMs).toISOString(),
    dateWita: todayWita,
    trigger,
    openGaps: openGapKeys,
    newGaps,
    recovered,
    emailSent,
    emailError,
    autoRecover,
    health,
  };
}
