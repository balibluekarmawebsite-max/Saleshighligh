"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { yesterdayWitaIso } from "@/lib/daily/date";
import { runScraperCheck } from "@/lib/monitor/alerts";
import { enqueueDailyRescrape } from "@/lib/monitor/rescrape";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Admin-only: run the scraper-health check now (records + may email + recover). */
export async function runCheckNowAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only admins can run the check." };

  try {
    const r = await runScraperCheck({ trigger: "manual" });
    revalidatePath("/admin/scraper");

    const parts: string[] = [
      r.openGaps.length === 0
        ? "All daily feeds are healthy."
        : `${r.openGaps.length} open gap${r.openGaps.length === 1 ? "" : "s"} (${r.newGaps.length} new).`,
    ];
    const queued = r.recovered.filter((x) => x.jobId).length;
    if (queued > 0) parts.push(`${queued} re-pull${queued === 1 ? "" : "s"} queued.`);
    if (r.emailSent) parts.push("Alert emailed.");
    else if (r.newGaps.length > 0 && r.emailError) parts.push(`Email not sent: ${r.emailError}.`);
    return { ok: true, message: parts.join(" ") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Check failed." };
  }
}

/** Admin-only: queue a daily re-pull for one property (targets yesterday WITA). */
export async function requestRescrapeAction(propertyCode: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only admins can request a re-pull." };

  const date = yesterdayWitaIso();
  const r = await enqueueDailyRescrape(
    propertyCode,
    date,
    user && user.id !== "system" ? user.id : null,
  );
  revalidatePath("/admin/scraper");

  if (r.jobId && r.skipped === "already queued") {
    return { ok: true, message: `A re-pull for ${propertyCode} (${date}) is already queued.` };
  }
  if (r.jobId) return { ok: true, message: `Re-pull queued for ${propertyCode} (${date}).` };
  return { ok: false, message: r.skipped ? `Could not queue: ${r.skipped}.` : "Could not queue a re-pull." };
}
