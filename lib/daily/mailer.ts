/**
 * SMTP mailer for the automated Daily Report email. Configured entirely from
 * env (the app's own domain / Google Workspace SMTP), so nothing is hard-coded
 * and the feature stays off until the credentials + recipients are set.
 *
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (true for 465),
 *   SMTP_USER, SMTP_PASS,
 *   DAILY_REPORT_FROM (defaults to SMTP_USER),
 *   DAILY_REPORT_TO  (comma-separated recipients).
 */

import nodemailer from "nodemailer";

/** Comma-separated recipient list from env → trimmed, non-empty addresses. */
export function dailyReportRecipients(): string[] {
  return (process.env.DAILY_REPORT_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The From address — an explicit DAILY_REPORT_FROM, else the SMTP user. */
export function fromAddress(): string {
  return (process.env.DAILY_REPORT_FROM?.trim() || process.env.SMTP_USER || "").trim();
}

/** True when the SMTP transport is fully configured (independent of recipients). */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && fromAddress());
}

/** True when SMTP + at least one env recipient are configured. (Recipients can
 * also come from the DB — see lib/daily/recipients — so the send path checks
 * `isSmtpConfigured()` plus the merged recipient list instead of this.) */
export function isEmailConfigured(): boolean {
  return isSmtpConfigured() && dailyReportRecipients().length > 0;
}

function transport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = /^(1|true|yes)$/i.test(process.env.SMTP_SECURE ?? "") || port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Send one mail via the configured SMTP. Throws on transport/auth failure. */
export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const info = await transport().sendMail({
    from: fromAddress(),
    to: input.to.join(", "),
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType ?? (a.filename.endsWith(".xlsx") ? XLSX_TYPE : undefined),
    })),
  });
  return { messageId: info.messageId };
}
