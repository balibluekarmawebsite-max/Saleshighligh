import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { occPercent } from "@/lib/weekly/calculations";
import { getWeeklyExportData } from "@/lib/weekly/export-data";
import { screenshotCategoryLabel } from "@/lib/weekly/screenshots";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Cell = string | number | null;

const r1 = (v: number | null | undefined): number | null =>
  v == null ? null : Math.round(v * 10) / 10;
const occ = (frac: number | null | undefined): number | null => r1(occPercent(frac ?? null));

/**
 * GET /api/weekly/export/xlsx?property=BKDS&week=2026-10-01 — a multi-sheet
 * Excel workbook of the week's data (raw numeric cells), one sheet per section.
 */
export async function GET(req: NextRequest) {
  if (!rateLimit(req, "weekly-export", 10, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR", "VIEWER"]);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const property = url.searchParams.get("property");
  const week = url.searchParams.get("week");
  if (!property || !week) {
    return Response.json({ error: "property and week are required." }, { status: 400 });
  }
  if (!isWeekId(week)) {
    return Response.json({ error: "week must be a yyyy-mm-dd week id." }, { status: 400 });
  }

  const data = await getWeeklyExportData(property, week);
  if (!data) return Response.json({ error: "Report not found for this week." }, { status: 404 });

  const sectionsParam = url.searchParams.get("sections");
  const sel = sectionsParam ? new Set(sectionsParam.split(",")) : null;
  const show = (id: string) => !sel || sel.has(id);

  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, aoa: Cell[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Name must be ≤31 chars and free of []:*?/\ — Excel's constraints.
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  // Cover / meta sheet (always present).
  addSheet("Report", [
    ["Blue Karma Group — Weekly Report"],
    ["Property", `${data.property.name} (${data.property.code})`],
    ["Area", data.property.area],
    ["Week", data.week.label],
    ["Week number", `${data.week.weekNumber} / ${data.week.year}`],
    ["Period", `${data.week.startDate} → ${data.week.endDate}`],
    ["Status", data.week.status],
    ["Headline month", data.headlineMonthLabel ?? "—"],
  ]);

  if (show("overview")) {
    addSheet("Overview", [
      ["Section", "Content", "AI draft"],
      ...data.overview.map((b): Cell[] => [b.heading, b.body ?? "", b.aiDraft ? "yes" : ""]),
    ]);
  }

  if (show("monthly") && data.monthly.rows.length > 0) {
    const t = data.monthly.totals;
    addSheet("Monthly", [
      ["Month", "RN Sold", "Occ Actual %", "Occ Budget %", "Occ LY %", "ARR Actual", "ARR Budget", "ARR LY", "Rev Actual", "Rev Budget", "Rev LY"],
      ...data.monthly.rows.map((m): Cell[] => [
        m.monthLabel, m.rnSold, occ(m.occActual), occ(m.occBudget), occ(m.occLy),
        m.arrActual, m.arrBudget, m.arrLy, m.revActual, m.revBudget, m.revLy,
      ]),
      ["TOTAL / YTD", t.rnSold, null, null, null, r1(t.arrActual), r1(t.arrBudget), r1(t.arrLy), t.revActual, t.revBudget, t.revLy],
    ]);
  }

  if (show("segments") && data.segments.rows.length > 0) {
    const t = data.segments.totals;
    addSheet("Market Segment", [
      ["Segment", "Group", "Room Nights", "Gross Revenue", "ARR", "Share %"],
      ...data.segments.rows.map((s): Cell[] => [s.label, s.group ?? "", s.rnSold, s.grossRevenue, r1(s.arr), r1(s.share)]),
      ["TOTAL", "", t.rn, t.revenue, r1(t.arr), 100],
    ]);
  }

  if (show("ratecodes") && data.rateCodes.rows.length > 0) {
    const t = data.rateCodes.totals;
    addSheet("Rate Codes", [
      ["Rate Code / Promotion", "Room Nights", "Gross Revenue", "ARR", "Share %"],
      ...data.rateCodes.rows.map((r): Cell[] => [r.label, r.rnSold, r.grossRevenue, r1(r.arr), r1(r.share)]),
      ["TOTAL", t.rn, t.revenue, r1(t.arr), 100],
    ]);
  }

  if (show("channels") && data.channels.rows.length > 0) {
    addSheet("Channels", [
      ["Source", "Year", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "YTD", "Share %"],
      ...data.channels.rows.map((c): Cell[] => [c.source, c.year, ...c.months, c.ytd, r1(c.share)]),
      ["TOTAL", "", null, null, null, null, null, null, null, null, null, null, null, null, data.channels.ytdTotal, 100],
    ]);
  }

  if (show("social") && data.social.length > 0) {
    addSheet("Social", [
      ["Platform", "Metric", "Last Week", "This Week", "Growth", "Growth %"],
      ...data.social.map((s): Cell[] => [s.platform, s.metric, s.lastWeek, s.thisWeek, s.growth, r1(s.growthPct)]),
    ]);
  }

  if (show("screenshots") && data.screenshots.length > 0) {
    addSheet("Screenshots", [
      ["Category", "Title", "Summary"],
      ...data.screenshots.map((s): Cell[] => [screenshotCategoryLabel(s.category), s.title ?? "", s.summary ?? ""]),
    ]);
  }

  if (show("departments")) {
    const acts = [
      ...data.departments.sales.map((a) => ({ dept: "Sales", ...a })),
      ...data.departments.ecommerce.map((a) => ({ dept: "E-commerce", ...a })),
    ];
    if (acts.length > 0) {
      addSheet("Activities", [
        ["Department", "Date", "Activity", "Notes"],
        ...acts.map((a): Cell[] => [a.dept, a.dateLabel ?? "", a.title ?? "", a.notes ?? ""]),
      ]);
    }
    if (data.departments.trainings.length > 0) {
      addSheet("Trainings", [
        ["Date", "Topic", "Duration", "Trainer", "Participants"],
        ...data.departments.trainings.map((t): Cell[] => [t.dateLabel ?? "", t.topic, t.duration ?? "", t.trainer ?? "", t.participants ?? ""]),
      ]);
    }
  }

  if (show("plans") && data.departments.actionPlans.length > 0) {
    addSheet("Action Plans", [
      ["Category", "Plan", "Start", "Deadline", "Remark"],
      ...data.departments.actionPlans.map((a): Cell[] => [a.category ?? "", a.plan, a.startLabel ?? "", a.deadlineLabel ?? "", a.remark ?? ""]),
    ]);
  }

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  try {
    const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
    if (prop) {
      await prisma.exportHistory.create({
        data: { propertyId: prop.id, period: new Date(`${week}T00:00:00.000Z`), format: "xlsx", scope: "weekly" },
      });
    }
    await logAudit("weekly_export.xlsx", `${property} ${week}`, { sections: sectionsParam ?? "all" });
  } catch {
    /* ignore audit failures */
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${property}-${week}-weekly-report.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
