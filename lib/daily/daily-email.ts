/**
 * Orchestrates the automated Daily Report email: gather the data, render it,
 * send it via SMTP, and record an audit row. Safe no-op (sent:false) when email
 * isn't configured, so the scheduler can run harmlessly until credentials land.
 */

import { logAudit } from "@/lib/audit";
import { buildDailyEmailData } from "@/lib/daily/daily-email-data";
import { renderDailyEmail } from "@/lib/daily/daily-email-render";
import { dailyReportRecipients, isEmailConfigured, sendMail } from "@/lib/daily/mailer";

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
  if (!isEmailConfigured()) {
    return { sent: false, reason: "email not configured — set SMTP_* and DAILY_REPORT_TO" };
  }

  const data = await buildDailyEmailData();
  const { subject, html, text } = renderDailyEmail(data, { dashboardUrl: dashboardLink() });
  const to = dailyReportRecipients();

  await sendMail({ to, subject, html, text });
  await logAudit("daily_report_email", subject, { to, properties: data.properties.length }).catch(() => {});

  return { sent: true, to, properties: data.properties.length, subject };
}
