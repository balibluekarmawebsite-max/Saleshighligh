"use server";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { sendDailyReport } from "@/lib/daily/daily-email";

/**
 * Admin-only: send the Daily Report email right now (to the configured
 * recipients) so delivery can be verified on demand. The send itself logs a
 * sent/failed row, so the result also shows up in the monitor history.
 * (A "use server" module may only export async functions, so the result type
 * is declared by the caller, not exported here.)
 */
export async function sendTestDailyReport(): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only admins can send a test email." };

  try {
    const r = await sendDailyReport();
    if (r.sent) {
      const n = r.properties ?? 0;
      return {
        ok: true,
        message: `Sent to ${(r.to ?? []).join(", ") || "the configured recipients"} · ${n} propert${n === 1 ? "y" : "ies"}.`,
      };
    }
    return { ok: false, message: r.reason ?? "Not sent." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Send failed." };
  }
}
