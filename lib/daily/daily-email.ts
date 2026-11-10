/**
 * Orchestrates the automated Daily Report email: gather the data, render it,
 * send it via SMTP, and record an audit row. Safe no-op (sent:false) when email
 * isn't configured, so the scheduler can run harmlessly until credentials land.
 */

import { logAudit } from "@/lib/audit";
import { buildDailyDetailData } from "@/lib/daily/daily-detail-data";
import { renderDailyDetailEmail } from "@/lib/daily/daily-detail-render";
import { buildAllWorkbooks } from "@/lib/daily/daily-xlsx";
import { dailyReportRecipients, isEmailConfigured, sendMail, type MailAttachment } from "@/lib/daily/mailer";

export interface DailyReportResult {
  sent: boolean;
  reason?: string;
  to?: string[];
  properties?: number;
  subject?: string;
}

/** Deep-link to the live Daily Report, from APP_URL / auth URL env. */
function dashboardLink(): string | undefined {
  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return base ? `${base}/daily` : undefined;
}

export async function sendDailyReport(): Promise<DailyReportResult> {
  const startedMs = Date.now();

  if (!isEmailConfigured()) {
    const reason = "email not configured — set SMTP_* and DAILY_REPORT_TO";
    // Record the skip too, so the monitor shows the job ran but email is off.
    await logAudit("daily_report_email", "(skipped)", { status: "skipped", reason }).catch(() => {});
    return { sent: false, reason };
  }

  const to = dailyReportRecipients();
  try {
    const data = await buildDailyDetailData();
    const { subject, html, text } = renderDailyDetailEmail(data, { dashboardUrl: dashboardLink() });

    // One Excel workbook per property (daily grid + month-tab history), attached.
    // Best-effort: a workbook-generation hiccup must never block the text email,
    // which is the primary deliverable.
    let attachments: MailAttachment[] = [];
    try {
      const workbooks = await buildAllWorkbooks();
      attachments = workbooks.map((w) => ({ filename: w.filename, content: w.buffer }));
    } catch {
      attachments = [];
    }

    const { messageId } = await sendMail({ to, subject, html, text, attachments });
    await logAudit("daily_report_email", subject, {
      status: "sent",
      to,
      properties: data.properties.length,
      attachments: attachments.length,
      messageId,
      durationMs: Date.now() - startedMs,
    }).catch(() => {});
    return { sent: true, to, properties: data.properties.length, subject };
  } catch (e) {
    // Record the failure for the monitor, then re-throw so the cron route still
    // surfaces a 500 (its non-200 is what any external alerting keys on).
    const error = e instanceof Error ? e.message : "daily report email failed";
    await logAudit("daily_report_email", "(failed)", {
      status: "failed",
      error,
      to,
      durationMs: Date.now() - startedMs,
    }).catch(() => {});
    throw e;
  }
}
