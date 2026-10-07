import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";
import { type WeeklyProgressItem } from "@/lib/weekly/dashboard-data";

/** The 7 Section A overview blocks, in report order. */
export const OVERVIEW_BLOCKS: { key: string; heading: string }[] = [
  { key: "financial", heading: "1. Financial" },
  { key: "market", heading: "2. Market Overview" },
  { key: "pace", heading: "3. Pace Report" },
  { key: "countries", heading: "4. Countries" },
  { key: "booking_window", heading: "5. Booking Window" },
  { key: "booking_ranking", heading: "6. Booking.com Ranking" },
  { key: "learning", heading: "7. Learning & Growth / Trainings" },
];

/** Statuses that lock a report from further editing. */
export function isLockedStatus(status: string): boolean {
  return status === "APPROVED" || status === "EXPORTED";
}

export interface WeeklyReportRow {
  week: string; // yyyy-mm-dd
  label: string;
  status: string;
  owner: string | null;
  updatedAt: string;
  sectionsReady: number;
  sectionsTotal: number;
}

/** All weekly reports for a property, newest first, with a light progress count. */
export async function getWeeklyReportsList(
  propertyCode: string,
): Promise<WeeklyReportRow[]> {
  noStore();
  const reports = await prisma.weeklyReport.findMany({
    where: { property: { code: propertyCode } },
    orderBy: { endDate: "desc" },
    select: {
      endDate: true,
      label: true,
      status: true,
      updatedAt: true,
      owner: { select: { name: true, email: true } },
      overviewBlocks: { select: { body: true } },
      _count: {
        select: {
          monthlyStats: true,
          segmentProductions: true,
          channelRns: true,
          socialMetrics: true,
          actionPlans: true,
        },
      },
    },
  });

  return reports.map((r) => {
    const overviewReady = r.overviewBlocks.some((b) => b.body && b.body.trim() !== "");
    const ready = [
      overviewReady,
      r._count.monthlyStats > 0,
      r._count.segmentProductions > 0,
      r._count.channelRns > 0,
      r._count.socialMetrics > 0,
      r._count.actionPlans > 0,
    ].filter(Boolean).length;
    return {
      week: r.endDate.toISOString().slice(0, 10),
      label: r.label ?? r.endDate.toISOString().slice(0, 10),
      status: r.status,
      owner: r.owner?.name ?? r.owner?.email ?? null,
      updatedAt: r.updatedAt.toISOString().slice(0, 10),
      sectionsReady: ready,
      sectionsTotal: 6,
    };
  });
}

export interface WeeklyEditorBlock {
  key: string;
  heading: string;
  body: string;
  aiDraft: boolean;
}

export interface WeeklyEditorData {
  week: { id: string; label: string; status: string; locked: boolean } | null;
  blocks: WeeklyEditorBlock[];
  progress: WeeklyProgressItem[];
}

/** The editor view model for one week: overview blocks (all 7) + section progress. */
export async function getWeeklyEditorData(
  propertyCode: string,
  week: string,
): Promise<WeeklyEditorData> {
  noStore();
  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    include: {
      overviewBlocks: true,
      segmentProductions: { select: { id: true } },
      socialMetrics: { select: { thisWeek: true } },
      _count: { select: { monthlyStats: true, channelRns: true, actionPlans: true } },
    },
  });

  if (!report) {
    return {
      week: null,
      blocks: OVERVIEW_BLOCKS.map((b) => ({ ...b, body: "", aiDraft: false })),
      progress: [],
    };
  }

  const byKey = new Map(report.overviewBlocks.map((b) => [b.key, b]));
  const blocks: WeeklyEditorBlock[] = OVERVIEW_BLOCKS.map((def) => {
    const existing = byKey.get(def.key);
    return {
      key: def.key,
      heading: def.heading,
      body: existing?.body ?? "",
      aiDraft: existing?.aiDraft ?? false,
    };
  });

  const overviewReady = report.overviewBlocks.some(
    (b) => b.body !== null && b.body.trim() !== "",
  );
  const socialReady = report.socialMetrics.some((s) => s.thisWeek !== null);
  const progress: WeeklyProgressItem[] = [
    { key: "A", title: "Sales & Marketing Overview", done: overviewReady },
    { key: "B", title: "YTD Actual / Budget / Last Year", done: report._count.monthlyStats > 0 },
    { key: "C", title: "Weekly Market Segment", done: report.segmentProductions.length > 0 },
    { key: "E/F", title: "Channel Inside (Room Nights)", done: report._count.channelRns > 0 },
    { key: "H", title: "Social Media Insight", done: socialReady },
    { key: "J", title: "Next Week Action Plan", done: report._count.actionPlans > 0 },
  ];

  return {
    week: {
      id: week,
      label: report.label ?? week,
      status: report.status,
      locked: isLockedStatus(report.status),
    },
    blocks,
    progress,
  };
}
