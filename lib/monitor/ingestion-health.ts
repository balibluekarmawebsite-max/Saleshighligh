/**
 * Read-side scraper/ingestion health for the Scraper Health monitor and the
 * scheduled check. Reads only existing signals — nothing new to record here:
 *
 *   - DAILY feeds: the latest successful push per property per feed, from the
 *     `AuditLog` row each import writes (action = feed, entity = property code).
 *   - Occupancy data freshness: the latest stored snapshot date per property.
 *   - WEEKLY: the last `weekly_auto_sync` audit row (Metricool + ads + queued
 *     scrape sections per property).
 *   - The office-PC poller heartbeat and recent scrape-queue jobs.
 *   - The recent scraper-health check runs (lib/monitor/runs).
 *
 * All derivations go through the pure helpers in health-logic.ts.
 */

import { unstable_noStore as noStore } from "next/cache";

import { witaDateIso } from "@/lib/daily/date";
import {
  classifyDailyFeed,
  gapKey,
  isGap,
  relativeAge,
  type FeedStatus,
} from "@/lib/monitor/health-logic";
import { DAILY_FEEDS, DAILY_FEED_ACTIONS, type DailyFeedKey } from "@/lib/monitor/feeds";
import { getRecentCheckRuns, type ScraperCheckRunView } from "@/lib/monitor/runs";
import { prisma } from "@/lib/prisma";
import { isAdsSyncConfigured } from "@/lib/weekly/ads-sync";
import { getRecentScrapeJobs, isScrapeQueueConfigured, type ScrapeJobView } from "@/lib/weekly/jobs";
import { isMetricoolConfigured } from "@/lib/weekly/metricool";
import { getPollerHeartbeat } from "@/lib/weekly/poller-heartbeat";
import { currentWeekId } from "@/lib/weekly/week";

export interface DailyFeedHealth {
  property: string; // code
  propertyName: string;
  feed: DailyFeedKey;
  feedLabel: string;
  critical: boolean;
  status: FeedStatus;
  lastPushAt: string | null; // ISO
  lastPushWitaDate: string | null; // yyyy-mm-dd
  lastPushAgeLabel: string;
  lastRows: number | null; // rows written on the last push, when recorded
  gapKey: string; // CODE:feed:todayWita
}

export interface PropertyDataFreshness {
  property: string;
  latestSnapshotDate: string | null; // max occupancy snapshot date
  expectedDate: string; // yesterday WITA
  dataCurrent: boolean; // latest >= expected
}

export interface WeeklyPropertyHealth {
  property: string;
  metricoolRows: number | null;
  adsRows: number | null;
  scrapeQueued: string[];
  errors: string[];
}

export interface WeeklySyncHealth {
  configured: { metricool: boolean; ads: boolean; scrapeQueue: boolean };
  lastRunAt: string | null;
  lastRunWeek: string | null;
  currentWeek: string;
  coversCurrentWeek: boolean;
  perProperty: WeeklyPropertyHealth[];
}

export interface PollerHealth {
  seenAt: string | null;
  worker: string | null;
  ageLabel: string;
  aliveRecently: boolean;
}

export interface ScraperHealth {
  todayWita: string;
  yesterdayWita: string;
  dailyFeeds: DailyFeedHealth[];
  freshness: PropertyDataFreshness[];
  /** All gaps (critical + secondary) as keys, deduped, for the alert + de-dup. */
  openGapKeys: string[];
  criticalGapKeys: string[];
  weekly: WeeklySyncHealth;
  poller: PollerHealth;
  recentJobs: ScrapeJobView[];
  recentRuns: ScraperCheckRunView[];
  lastRun: ScraperCheckRunView | null;
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function parseWeekly(
  row: { createdAt: Date; entity: string | null; detail: unknown } | null,
): WeeklySyncHealth {
  const configured = {
    metricool: isMetricoolConfigured(),
    ads: isAdsSyncConfigured(),
    scrapeQueue: isScrapeQueueConfigured(),
  };
  const currentWeek = currentWeekId();
  if (!row) {
    return { configured, lastRunAt: null, lastRunWeek: null, currentWeek, coversCurrentWeek: false, perProperty: [] };
  }
  const detail = asObj(row.detail);
  const results = Array.isArray(detail.results) ? detail.results : [];
  const perProperty: WeeklyPropertyHealth[] = results.map((r) => {
    const o = asObj(r);
    return {
      property: typeof o.property === "string" ? o.property : "?",
      metricoolRows: asNum(o.metricoolRows),
      adsRows: asNum(o.adsRows),
      scrapeQueued: asStrArr(o.scrapeQueued),
      errors: asStrArr(o.errors),
    };
  });
  const lastRunWeek = typeof row.entity === "string" ? row.entity : null;
  return {
    configured,
    lastRunAt: row.createdAt.toISOString(),
    lastRunWeek,
    currentWeek,
    coversCurrentWeek: lastRunWeek === currentWeek,
    perProperty,
  };
}

/**
 * Assemble the full scraper-health snapshot. `nowMs` is injectable so the
 * scheduled check and the page agree on "today" and ages.
 */
export async function getScraperHealth(nowMs: number = Date.now()): Promise<ScraperHealth> {
  noStore();
  const todayWita = witaDateIso(nowMs, 0);
  const yesterdayWita = witaDateIso(nowMs, -1);

  const [props, auditRows, snapMax, weeklyRow, recentJobs, recentRuns] = await Promise.all([
    prisma.property.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.auditLog.findMany({
      where: { action: { in: DAILY_FEED_ACTIONS } },
      select: { action: true, entity: true, createdAt: true, detail: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.dailyPickupSnapshot.groupBy({ by: ["propertyId"], _max: { snapshotDate: true } }),
    prisma.auditLog.findFirst({
      where: { action: "weekly_auto_sync" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, entity: true, detail: true },
    }),
    getRecentScrapeJobs(20),
    getRecentCheckRuns(10),
  ]);

  // Latest successful push per (property code, feed action). Rows are desc by
  // createdAt, so the first time we see a key is its most recent push.
  const latestPush = new Map<string, { at: Date; rows: number | null }>();
  for (const r of auditRows) {
    const code = (r.entity ?? "").toUpperCase();
    const k = `${code}|${r.action}`;
    if (latestPush.has(k)) continue;
    const d = asObj(r.detail);
    const rows = asNum(d.rows) ?? asNum(d.written);
    latestPush.set(k, { at: r.createdAt, rows });
  }

  const snapByProp = new Map<string, Date | null>();
  for (const s of snapMax) snapByProp.set(s.propertyId, s._max.snapshotDate ?? null);

  const dailyFeeds: DailyFeedHealth[] = [];
  const freshness: PropertyDataFreshness[] = [];
  const openGapKeys: string[] = [];
  const criticalGapKeys: string[] = [];

  for (const p of props) {
    for (const feed of DAILY_FEEDS) {
      const lp = latestPush.get(`${p.code.toUpperCase()}|${feed.auditAction}`) ?? null;
      const lastPushMs = lp ? lp.at.getTime() : null;
      const lastPushWitaDate = lastPushMs != null ? witaDateIso(lastPushMs, 0) : null;
      const status = classifyDailyFeed(lastPushWitaDate, todayWita);
      const key = gapKey(p.code, feed.key, todayWita);
      if (isGap(status)) {
        openGapKeys.push(key);
        if (feed.critical) criticalGapKeys.push(key);
      }
      dailyFeeds.push({
        property: p.code,
        propertyName: p.name,
        feed: feed.key,
        feedLabel: feed.label,
        critical: feed.critical,
        status,
        lastPushAt: lastPushMs != null ? new Date(lastPushMs).toISOString() : null,
        lastPushWitaDate,
        lastPushAgeLabel: relativeAge(lastPushMs, nowMs),
        lastRows: lp?.rows ?? null,
        gapKey: key,
      });
    }

    const latestSnap = snapByProp.get(p.id) ?? null;
    const latestSnapshotDate = latestSnap ? latestSnap.toISOString().slice(0, 10) : null;
    freshness.push({
      property: p.code,
      latestSnapshotDate,
      expectedDate: yesterdayWita,
      dataCurrent: latestSnapshotDate != null && latestSnapshotDate >= yesterdayWita,
    });
  }

  const hb = getPollerHeartbeat();
  const poller: PollerHealth = {
    seenAt: hb ? new Date(hb.at).toISOString() : null,
    worker: hb?.worker ?? null,
    ageLabel: relativeAge(hb ? hb.at : null, nowMs),
    aliveRecently: hb != null && nowMs - hb.at < 10 * 60_000,
  };

  return {
    todayWita,
    yesterdayWita,
    dailyFeeds,
    freshness,
    openGapKeys,
    criticalGapKeys,
    weekly: parseWeekly(weeklyRow),
    poller,
    recentJobs,
    recentRuns,
    lastRun: recentRuns[0] ?? null,
  };
}
