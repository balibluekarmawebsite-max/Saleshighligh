import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isAdsSyncConfigured, syncAdsIntoReport } from "@/lib/weekly/ads-sync";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/weekly/ads/sync — pull the latest ads/ROAS into weekly reports.
 *
 * Auth: an internal cron token (header `x-ads-sync-token` === ADS_SYNC_TOKEN),
 * OR a signed-in EDITOR/ADMIN. Body (JSON, all optional):
 *   { "property": "BKDS", "week": "2026-10-01" }
 * With no property, syncs every property that has weekly reports; with no week,
 * syncs each property's most recent report (the just-closed week).
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(req, "weekly-ads-sync", 12, 60_000)) return tooManyRequests();

  const envToken = process.env.ADS_SYNC_TOKEN;
  const viaToken = !!envToken && req.headers.get("x-ads-sync-token") === envToken;
  if (!viaToken) {
    const guard = await requireRole(["ADMIN", "EDITOR"]);
    if ("response" in guard) return guard.response;
  }

  if (!isAdsSyncConfigured()) {
    return Response.json({ error: "Ads sync isn't configured — set ADS_API_KEY on the server." }, { status: 501 });
  }

  let property: string | undefined;
  let week: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { property?: string; week?: string };
    property = body.property?.toUpperCase();
    week = body.week;
  } catch {
    /* empty body is fine */
  }
  if (week && !isWeekId(week)) {
    return Response.json({ error: "week must be a yyyy-mm-dd week id." }, { status: 400 });
  }

  const codes = property
    ? [property]
    : (await prisma.property.findMany({ where: { weeklyReports: { some: {} } }, select: { code: true }, orderBy: { code: "asc" } })).map((p) => p.code);

  const results: { property: string; ok: boolean; rows?: number; message?: string }[] = [];
  for (const code of codes) {
    const report = week
      ? await prisma.weeklyReport.findFirst({ where: { property: { code }, endDate: new Date(`${week}T00:00:00.000Z`) }, select: { id: true, status: true } })
      : await prisma.weeklyReport.findFirst({ where: { property: { code } }, orderBy: { endDate: "desc" }, select: { id: true, status: true } });
    if (!report) {
      results.push({ property: code, ok: false, message: "no report" });
      continue;
    }
    if (isLockedStatus(report.status)) {
      results.push({ property: code, ok: false, message: "report locked" });
      continue;
    }
    try {
      const r = await syncAdsIntoReport(report.id, code);
      results.push({ property: code, ok: true, rows: r.rows });
    } catch (err) {
      results.push({ property: code, ok: false, message: err instanceof Error ? err.message : "sync failed" });
    }
  }

  const synced = results.filter((r) => r.ok).length;
  await logAudit("weekly_ads_sync_batch", property ?? "ALL", { synced, results });
  return Response.json({ ok: true, synced, results });
}
