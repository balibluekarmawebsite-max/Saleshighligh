/**
 * Daily Report email recipients: the DB-managed list (editable from
 * /admin/daily-email) merged with the DAILY_REPORT_TO env list. The env entries
 * are shown read-only; DB entries can be added/removed in the UI.
 */

import { dailyReportRecipients as envRecipients } from "@/lib/daily/mailer";
import { prisma } from "@/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (e: string): boolean => EMAIL_RE.test(e.trim());

export interface RecipientRow {
  id: string; // DB id, or `env:<email>` for env entries
  email: string;
  source: "db" | "env";
}

/** All recipients: DB (removable) first, then env-only (read-only), deduped.
 * If the table isn't there yet (migration not applied), falls back to env-only
 * so the page and the send path keep working. */
export async function getRecipientRows(): Promise<RecipientRow[]> {
  let db: { id: string; email: string }[] = [];
  try {
    db = await prisma.dailyReportRecipient.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } });
  } catch {
    db = [];
  }
  const seen = new Set(db.map((r) => r.email.toLowerCase()));
  const rows: RecipientRow[] = db.map((r) => ({ id: r.id, email: r.email, source: "db" }));
  for (const e of envRecipients()) {
    const key = e.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      rows.push({ id: `env:${e}`, email: e, source: "env" });
    }
  }
  return rows;
}

/** The addresses the daily email is sent to (DB ∪ env, deduped). */
export async function getDailyRecipientEmails(): Promise<string[]> {
  const rows = await getRecipientRows();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = r.email.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(r.email.trim());
    }
  }
  return out;
}

export interface MutateResult {
  ok: boolean;
  message: string;
}

/** Add a recipient (stored lowercase; idempotent on a duplicate). */
export async function addRecipient(email: string): Promise<MutateResult> {
  const e = email.trim().toLowerCase();
  if (!isValidEmail(e)) return { ok: false, message: "Enter a valid email address." };
  try {
    await prisma.dailyReportRecipient.upsert({ where: { email: e }, create: { email: e }, update: {} });
    return { ok: true, message: `Added ${e}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not add recipient." };
  }
}

/** Remove a DB recipient by id. (Env entries can't be removed here.) */
export async function removeRecipient(id: string): Promise<MutateResult> {
  if (id.startsWith("env:")) return { ok: false, message: "This address comes from DAILY_REPORT_TO in .env — edit it there." };
  try {
    await prisma.dailyReportRecipient.delete({ where: { id } });
    return { ok: true, message: "Recipient removed." };
  } catch {
    return { ok: false, message: "Could not remove (already gone?)." };
  }
}
