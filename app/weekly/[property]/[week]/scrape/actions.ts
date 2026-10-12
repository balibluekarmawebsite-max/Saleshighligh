"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { createScrapeJob } from "@/lib/weekly/jobs";

export interface ScrapeActionResult {
  ok: boolean;
  message?: string;
}

/** Queue an on-demand scrape job for the office PC to pick up. EDITOR/ADMIN. */
export async function requestScrape(
  _prev: ScrapeActionResult | null,
  fd: FormData,
): Promise<ScrapeActionResult> {
  const property = String(fd.get("property") ?? "").toUpperCase();
  const week = String(fd.get("week") ?? "");
  const section = String(fd.get("section") ?? "");

  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have access to request a scrape for ${property}.` };
  }

  const res = await createScrapeJob({
    property,
    section,
    start: fd.get("start") ? String(fd.get("start")) : null,
    end: fd.get("end") ? String(fd.get("end")) : null,
    month: fd.get("month") ? String(fd.get("month")) : null,
    weekEnding: fd.get("week_ending") ? String(fd.get("week_ending")) : null,
    requestedById: user && user.id !== "system" ? user.id : null,
  });
  if (!res.ok) return { ok: false, message: res.error };

  await logAudit("scrape_requested", `${property} ${section}`, { jobId: res.id }).catch(() => {});
  revalidatePath(`/weekly/${property}/${week}/scrape`);
  return { ok: true, message: "Scrape requested — the office PC will pick it up within a couple of minutes." };
}
