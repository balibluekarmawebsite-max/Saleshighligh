import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";
import { type WeeklyProgressItem } from "@/lib/weekly/dashboard-data";
import { type WeeklySectionId } from "@/lib/weekly/sections";
import { weekLabel } from "@/lib/weekly/week";

/** The Section A overview blocks, in report order. Each can hold text + screenshots. */
export const OVERVIEW_BLOCKS: { key: string; heading: string }[] = [
  { key: "financial", heading: "1. Financial" },
  { key: "market", heading: "2. Market Overview" },
  { key: "pace", heading: "3. Pace Report" },
  { key: "countries", heading: "4. Countries" },
  { key: "booking_window", heading: "5. Booking Window" },
  { key: "booking_ranking", heading: "6. Booking.com Ranking" },
  { key: "building_image", heading: "7. Building Hotel Image" },
  { key: "promotion", heading: "8. Promotion Analysis" },
  { key: "roas", heading: "9. ROAS / Digital Ads" },
  { key: "learning", heading: "10. Learning & Growth" },
];

/** The 5 Section H social metrics, in report order (label ↔ stored metricKey). */
export const SOCIAL_METRIC_ROWS: { key: string; label: string }[] = [
  { key: "website_visit", label: "Website Visit" },
  { key: "profile_visit", label: "Profile Visit" },
  { key: "account_reached", label: "Account Reached" },
  { key: "impression", label: "Impression" },
  { key: "followers", label: "Followers" },
];

/** Platforms offered in the Section H selector. */
export const SOCIAL_PLATFORMS = ["Instagram", "Facebook", "TikTok", "YouTube"] as const;

/** Statuses that lock a report from further editing. */
export function isLockedStatus(status: string): boolean {
  return status === "APPROVED" || status === "EXPORTED";
}

/** A short "2 days ago" style label from a timestamp (computed at request). */
export function relativeTime(when: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - when.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export interface WeeklyReportRow {
  week: string; // yyyy-mm-dd
  label: string;
  weekNumber: number;
  year: number;
  status: string;
  owner: string | null;
  updatedAt: string;
  updatedAtRelative: string;
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
      year: true,
      weekNumber: true,
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

  const now = new Date();
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
    const week = r.endDate.toISOString().slice(0, 10);
    return {
      week,
      label: r.label ?? weekLabel(week),
      weekNumber: r.weekNumber,
      year: r.year,
      status: r.status,
      owner: r.owner?.name ?? r.owner?.email ?? null,
      updatedAt: r.updatedAt.toISOString().slice(0, 10),
      updatedAtRelative: relativeTime(r.updatedAt, now),
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

export type SectionRow = Record<string, string>;

export interface WeeklyDepartmentData {
  week: { id: string; label: string; status: string; locked: boolean } | null;
  rows: Record<WeeklySectionId, SectionRow[]>;
}

/** Load every Department Inputs section's rows (as strings, ready for inputs). */
export async function getWeeklyDepartmentData(
  propertyCode: string,
  week: string,
): Promise<WeeklyDepartmentData> {
  noStore();
  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    include: {
      activities: { orderBy: { sortOrder: "asc" } },
      socialMetrics: { orderBy: { sortOrder: "asc" } },
      trainings: { orderBy: { sortOrder: "asc" } },
      actionPlans: { orderBy: { sortOrder: "asc" } },
    },
  });

  const empty: Record<WeeklySectionId, SectionRow[]> = {
    sales: [], ecommerce: [], social: [], trainings: [], action_plans: [],
  };
  if (!report) return { week: null, rows: empty };

  const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
  const activities = (dept: string): SectionRow[] =>
    report.activities
      .filter((a) => a.department === dept)
      .map((a) => ({ dateLabel: s(a.dateLabel), title: s(a.title), notes: s(a.notes) }));

  return {
    week: {
      id: week,
      label: report.label ?? week,
      status: report.status,
      locked: isLockedStatus(report.status),
    },
    rows: {
      sales: activities("sales"),
      ecommerce: activities("ecommerce"),
      social: report.socialMetrics.map((m) => ({
        platform: s(m.platform),
        metricKey: s(m.metricKey),
        lastWeek: s(m.lastWeek),
        thisWeek: s(m.thisWeek),
      })),
      trainings: report.trainings.map((t) => ({
        dateLabel: s(t.dateLabel),
        topic: s(t.topic),
        duration: s(t.duration),
        trainer: s(t.trainer),
        participants: s(t.participants),
      })),
      action_plans: report.actionPlans.map((a) => ({
        category: s(a.category),
        plan: s(a.plan),
        startLabel: s(a.startLabel),
        deadlineLabel: s(a.deadlineLabel),
        remark: s(a.remark),
      })),
    },
  };
}

// ─── Full section editor (A–J + Owner Overview) ─────────────────────────────

/** The sections shown in the editor's left nav, in report order. */
export const EDITOR_SECTIONS = [
  { key: "A", code: "A", label: "Overview" },
  { key: "B", code: "B", label: "YTD Actual & Forecast" },
  { key: "C", code: "C", label: "Market Segment" },
  { key: "D", code: "D", label: "Rate Code / Promotion" },
  { key: "EF", code: "E/F", label: "Channel Inside" },
  { key: "G", code: "G", label: "Sales Activity" },
  { key: "G2", code: "G2", label: "E-commerce" },
  { key: "H", code: "H", label: "Social Media" },
  { key: "I", code: "I", label: "Training" },
  { key: "J", code: "J", label: "Action Plan" },
  { key: "OWNER", code: "★", label: "Owner Overview" },
] as const;

export type WeeklyEditorSectionKey = (typeof EDITOR_SECTIONS)[number]["key"];

/** Full month names for the Section B grid (report year). */
export const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface WeeklyFullEditorData {
  week:
    | {
        id: string;
        label: string;
        status: string;
        locked: boolean;
        startDate: string;
        endDate: string;
        year: number;
        weekNumber: number;
        owner: string | null;
        propertyName: string;
      }
    | null;
  overview: WeeklyEditorBlock[];
  monthly: SectionRow[];
  segments: SectionRow[];
  rateCodes: SectionRow[];
  channelsByYear: Record<string, SectionRow[]>;
  channelYears: number[];
  social: Record<string, Record<string, { lastWeek: string; thisWeek: string }>>;
  sales: SectionRow[];
  ecommerce: SectionRow[];
  trainings: SectionRow[];
  actionPlans: SectionRow[];
  ownerRepeaters: SectionRow[];
  ownerChannelMix: SectionRow[];
  completion: Record<WeeklyEditorSectionKey, boolean>;
}

/** Load every editor section (A–J + Owner Overview) for one week, as input-ready strings. */
export async function getWeeklyFullEditorData(
  propertyCode: string,
  week: string,
): Promise<WeeklyFullEditorData> {
  noStore();
  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    include: {
      property: { select: { name: true } },
      owner: { select: { name: true, email: true } },
      overviewBlocks: true,
      monthlyStats: true,
      segmentProductions: { orderBy: { sortOrder: "asc" } },
      rateCodeProductions: { orderBy: { sortOrder: "asc" } },
      channelRns: { orderBy: [{ year: "asc" }, { sortOrder: "asc" }] },
      activities: { orderBy: { sortOrder: "asc" } },
      socialMetrics: { orderBy: { sortOrder: "asc" } },
      trainings: { orderBy: { sortOrder: "asc" } },
      actionPlans: { orderBy: { sortOrder: "asc" } },
      ownerRepeaters: { orderBy: { sortOrder: "asc" } },
      ownerChannelMix: { orderBy: { sortOrder: "asc" } },
    },
  });

  const byKey = report ? new Map(report.overviewBlocks.map((b) => [b.key, b])) : new Map();
  const overview: WeeklyEditorBlock[] = OVERVIEW_BLOCKS.map((def) => {
    const existing = byKey.get(def.key);
    return {
      key: def.key,
      heading: def.heading,
      body: existing?.body ?? "",
      aiDraft: existing?.aiDraft ?? false,
    };
  });

  const emptyCompletion: Record<WeeklyEditorSectionKey, boolean> = {
    A: false, B: false, C: false, D: false, EF: false,
    G: false, G2: false, H: false, I: false, J: false, OWNER: false,
  };

  if (!report) {
    return {
      week: null,
      overview,
      monthly: emptyMonthly(),
      segments: [],
      rateCodes: [],
      channelsByYear: {},
      channelYears: [],
      social: {},
      sales: [],
      ecommerce: [],
      trainings: [],
      actionPlans: [],
      ownerRepeaters: [],
      ownerChannelMix: [],
      completion: emptyCompletion,
    };
  }

  const sstr = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
  const decStr = (d: { toNumber(): number } | null | undefined): string =>
    d == null ? "" : String(d.toNumber());
  const pctStr = (d: { toNumber(): number } | null | undefined): string => {
    if (d == null) return "";
    return String(Math.round(d.toNumber() * 100 * 100) / 100);
  };

  // Section B — 12 months (always all 12 rows, filled where present).
  const byMonth = new Map(report.monthlyStats.map((m) => [m.month, m]));
  const monthly: SectionRow[] = MONTHS_FULL.map((label, i) => {
    const m = byMonth.get(i + 1);
    return {
      month: String(i + 1),
      monthLabel: label,
      rnSold: sstr(m?.rnSold),
      occActual: pctStr(m?.occActual),
      occBudget: pctStr(m?.occBudget),
      occLy: pctStr(m?.occLy),
      arrActual: decStr(m?.arrActual),
      arrBudget: decStr(m?.arrBudget),
      arrLy: decStr(m?.arrLy),
      revActual: decStr(m?.revActual),
      revBudget: decStr(m?.revBudget),
      revLy: decStr(m?.revLy),
    };
  });

  const segments: SectionRow[] = report.segmentProductions.map((s) => ({
    label: sstr(s.label),
    segmentGroup: sstr(s.segmentGroup),
    rnSold: sstr(s.rnSold),
    grossRevenue: decStr(s.grossRevenue),
  }));

  const rateCodes: SectionRow[] = report.rateCodeProductions.map((r) => ({
    label: sstr(r.label),
    rnSold: sstr(r.rnSold),
    grossRevenue: decStr(r.grossRevenue),
  }));

  // Sections E/F — channel room-nights, grouped by year.
  const channelsByYear: Record<string, SectionRow[]> = {};
  for (const c of report.channelRns) {
    const y = String(c.year);
    (channelsByYear[y] ??= []).push({
      sourceLabel: sstr(c.sourceLabel),
      jan: sstr(c.jan), feb: sstr(c.feb), mar: sstr(c.mar), apr: sstr(c.apr),
      may: sstr(c.may), jun: sstr(c.jun), jul: sstr(c.jul), aug: sstr(c.aug),
      sep: sstr(c.sep), oct: sstr(c.oct), nov: sstr(c.nov), dec: sstr(c.dec),
    });
  }
  const channelYears = Array.from(
    new Set<number>([report.year, ...report.channelRns.map((c) => c.year)]),
  ).sort((a, b) => b - a);

  // Section H — social metrics, grouped by platform then metric key.
  const social: Record<string, Record<string, { lastWeek: string; thisWeek: string }>> = {};
  for (const m of report.socialMetrics) {
    const plat = m.platform || "Instagram";
    (social[plat] ??= {})[m.metricKey] = { lastWeek: sstr(m.lastWeek), thisWeek: sstr(m.thisWeek) };
  }

  const activities = (dept: string): SectionRow[] =>
    report.activities
      .filter((a) => a.department === dept)
      .map((a) => ({ dateLabel: sstr(a.dateLabel), title: sstr(a.title), notes: sstr(a.notes) }));

  const trainings: SectionRow[] = report.trainings.map((t) => ({
    dateLabel: sstr(t.dateLabel),
    topic: sstr(t.topic),
    duration: sstr(t.duration),
    trainer: sstr(t.trainer),
    participants: sstr(t.participants),
  }));

  const actionPlans: SectionRow[] = report.actionPlans.map((a) => ({
    category: sstr(a.category),
    plan: sstr(a.plan),
    remark: sstr(a.remark),
    startLabel: sstr(a.startLabel),
    deadlineLabel: sstr(a.deadlineLabel),
  }));

  const ownerRepeaters: SectionRow[] = report.ownerRepeaters.map((o) => ({
    label: sstr(o.label),
    roomNights: sstr(o.roomNights),
    revenue: decStr(o.revenue),
  }));

  const ownerChannelMix: SectionRow[] = report.ownerChannelMix.map((o) => ({
    label: sstr(o.label),
    rnSold: sstr(o.rnSold),
    grossRevenue: decStr(o.grossRevenue),
  }));

  const completion: Record<WeeklyEditorSectionKey, boolean> = {
    A: report.overviewBlocks.some((b) => b.body != null && b.body.trim() !== ""),
    B: report.monthlyStats.length > 0,
    C: report.segmentProductions.length > 0,
    D: report.rateCodeProductions.length > 0,
    EF: report.channelRns.length > 0,
    G: report.activities.some((a) => a.department === "sales"),
    G2: report.activities.some((a) => a.department === "ecommerce"),
    H: report.socialMetrics.some((m) => m.thisWeek != null || m.lastWeek != null),
    I: report.trainings.length > 0,
    J: report.actionPlans.length > 0,
    OWNER: report.ownerRepeaters.length > 0 || report.ownerChannelMix.length > 0,
  };

  return {
    week: {
      id: week,
      label: report.label ?? week,
      status: report.status,
      locked: isLockedStatus(report.status),
      startDate: report.startDate.toISOString().slice(0, 10),
      endDate: report.endDate.toISOString().slice(0, 10),
      year: report.year,
      weekNumber: report.weekNumber,
      owner: report.owner?.name ?? report.owner?.email ?? null,
      propertyName: report.property.name,
    },
    overview,
    monthly,
    segments,
    rateCodes,
    channelsByYear,
    channelYears,
    social,
    sales: activities("sales"),
    ecommerce: activities("ecommerce"),
    trainings,
    actionPlans,
    ownerRepeaters,
    ownerChannelMix,
    completion,
  };
}

/** A blank 12-month Section B grid (used when the week has no report yet). */
function emptyMonthly(): SectionRow[] {
  return MONTHS_FULL.map((label, i) => ({
    month: String(i + 1),
    monthLabel: label,
    rnSold: "", occActual: "", occBudget: "", occLy: "",
    arrActual: "", arrBudget: "", arrLy: "",
    revActual: "", revBudget: "", revLy: "",
  }));
}
