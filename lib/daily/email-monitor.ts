/**
 * Read-side status for the automated Daily Report email, for the admin monitor.
 * Combines the live SMTP/recipient configuration with the delivery history
 * recorded in the audit log (every send logs sent / failed / skipped), plus a
 * derived "did today's 07:00 run succeed?" flag.
 */

import { unstable_noStore as noStore } from "next/cache";

import { witaDateIso } from "@/lib/daily/date";
import { fromAddress, isSmtpConfigured } from "@/lib/daily/mailer";
import { getRecipientRows, type RecipientRow } from "@/lib/daily/recipients";
import { prisma } from "@/lib/prisma";

export type DeliveryStatus = "sent" | "failed" | "skipped" | "unknown";

export interface EmailConfig {
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  from: string | null;
  recipients: RecipientRow[];
  schedule: string;
  cronSecretSet: boolean;
}

export interface EmailDeliveryRow {
  id: string;
  at: string; // ISO datetime (UTC)
  status: DeliveryStatus;
  to: string[];
  properties: number | null;
  subject: string | null;
  error: string | null;
  messageId: string | null;
  durationMs: number | null;
}

export interface EmailDeliveryStatus {
  config: EmailConfig;
  history: EmailDeliveryRow[]; // newest first
  lastSentAt: string | null;
  lastAttempt: EmailDeliveryRow | null;
  sentTodayWita: boolean;
  todayWita: string;
}

function emailConfig(recipients: RecipientRow[]): EmailConfig {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = /^(1|true|yes)$/i.test(process.env.SMTP_SECURE ?? "") || port === 465;
  return {
    configured: isSmtpConfigured() && recipients.length > 0,
    host: process.env.SMTP_HOST?.trim() || null,
    port,
    secure,
    from: fromAddress() || null,
    recipients,
    schedule: "Daily at 07:00 WITA",
    cronSecretSet: Boolean(process.env.CRON_SECRET),
  };
}

const asStr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Assemble config + delivery history for the admin email monitor. */
export async function getEmailDeliveryStatus(limit = 60): Promise<EmailDeliveryStatus> {
  noStore();
  const recipients = await getRecipientRows();
  const rows = await prisma.auditLog.findMany({
    where: { action: "daily_report_email" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, createdAt: true, entity: true, detail: true },
  });

  const history: EmailDeliveryRow[] = rows.map((r) => {
    const d = (r.detail && typeof r.detail === "object" && !Array.isArray(r.detail)
      ? r.detail
      : {}) as Record<string, unknown>;
    // Rows written before the status field existed were success-only logs.
    const raw = asStr(d.status) ?? "sent";
    const status: DeliveryStatus = raw === "sent" || raw === "failed" || raw === "skipped" ? raw : "unknown";
    // On a successful send the subject is stored as the audit `entity`; failed /
    // skipped rows carry a "(failed)" / "(skipped)" marker there instead.
    const subject = r.entity && !r.entity.startsWith("(") ? r.entity : asStr(d.subject);
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      status,
      to: asStrArr(d.to),
      properties: asNum(d.properties),
      subject,
      error: asStr(d.error),
      messageId: asStr(d.messageId),
      durationMs: asNum(d.durationMs),
    };
  });

  const lastSent = history.find((h) => h.status === "sent") ?? null;
  const todayWita = witaDateIso(Date.now(), 0);
  const sentTodayWita = Boolean(lastSent && witaDateIso(new Date(lastSent.at).getTime(), 0) === todayWita);

  return {
    config: emailConfig(recipients),
    history,
    lastSentAt: lastSent?.at ?? null,
    lastAttempt: history[0] ?? null,
    sentTodayWita,
    todayWita,
  };
}
