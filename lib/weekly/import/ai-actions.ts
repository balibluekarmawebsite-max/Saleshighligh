"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import { getAiImportSection } from "@/lib/weekly/import/ai-sections";

export interface AiApplyResult {
  ok: boolean;
  written?: number;
  message?: string;
}

type Row = Record<string, string>;

const str = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const int = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim().replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const money = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim().replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const occFrac = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim().replace(/[%\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 100) * 10000) / 10000;
};
const m0 = (v: unknown): number => int(v) ?? 0;

const SOCIAL_KEYS = new Set([
  "website_visit", "profile_visit", "account_reached", "impression", "followers",
]);
function normalizeMetricKey(v: string): string | null {
  const k = v.toLowerCase().replace(/[\s-]+/g, "_");
  if (SOCIAL_KEYS.has(k)) return k;
  if (k.includes("website")) return "website_visit";
  if (k.includes("profile")) return "profile_visit";
  if (k.includes("reach")) return "account_reached";
  if (k.includes("impression")) return "impression";
  if (k.includes("follow")) return "followers";
  return null;
}

/** Write previewed AI-import rows for one section (replace-all, scoped). */
export async function applyAiImport(input: {
  property: string;
  week: string;
  section: string;
  rows: Row[];
  year?: number;
  platform?: string;
}): Promise<AiApplyResult> {
  const property = input.property.toUpperCase();
  const week = input.week;
  const section = getAiImportSection(input.section);
  if (!section) return { ok: false, message: "Unknown section." };

  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have import access to ${property}.` };
  }
  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: property }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { id: true, status: true, propertyId: true },
  });
  if (!report) return { ok: false, message: "Report not found." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to import." };
  }

  const rows = Array.isArray(input.rows) ? input.rows : [];
  const rid = report.id;
  let written = 0;

  try {
    await prisma.$transaction(async (tx) => {
      switch (section.id) {
        case "monthly": {
          const data = rows
            .map((r) => ({
              reportWeekId: rid,
              month: Number(r.month),
              rnSold: int(r.rnSold),
              occActual: occFrac(r.occActual), occBudget: occFrac(r.occBudget), occLy: occFrac(r.occLy),
              arrActual: money(r.arrActual), arrBudget: money(r.arrBudget), arrLy: money(r.arrLy),
              revActual: money(r.revActual), revBudget: money(r.revBudget), revLy: money(r.revLy),
            }))
            .filter(
              (r) =>
                Number.isInteger(r.month) && r.month >= 1 && r.month <= 12 &&
                [r.rnSold, r.occActual, r.occBudget, r.occLy, r.arrActual, r.arrBudget, r.arrLy, r.revActual, r.revBudget, r.revLy].some((v) => v != null),
            );
          await tx.weeklyMonthlyStat.deleteMany({ where: { reportWeekId: rid } });
          if (data.length) await tx.weeklyMonthlyStat.createMany({ data });
          written = data.length;
          break;
        }
        case "segment": {
          const data = rows.filter((r) => str(r.label)).map((r, i) => ({
            reportWeekId: rid, label: str(r.label) as string, segmentGroup: str(r.segmentGroup),
            rnSold: int(r.rnSold), grossRevenue: money(r.grossRevenue), sortOrder: i,
          }));
          await tx.weeklySegmentProduction.deleteMany({ where: { reportWeekId: rid } });
          if (data.length) await tx.weeklySegmentProduction.createMany({ data });
          written = data.length;
          break;
        }
        case "ratecode": {
          const data = rows.filter((r) => str(r.label)).map((r, i) => ({
            reportWeekId: rid, label: str(r.label) as string,
            rnSold: int(r.rnSold), grossRevenue: money(r.grossRevenue), sortOrder: i,
          }));
          await tx.weeklyRateCodeProduction.deleteMany({ where: { reportWeekId: rid } });
          if (data.length) await tx.weeklyRateCodeProduction.createMany({ data });
          written = data.length;
          break;
        }
        case "channel": {
          const year = Number(input.year);
          if (!Number.isInteger(year)) throw new Error("A valid year is required.");
          const seen = new Set<string>();
          const data = rows
            .filter((r) => {
              const label = str(r.sourceLabel);
              if (!label || seen.has(label)) return false;
              seen.add(label);
              return true;
            })
            .map((r, i) => ({
              reportWeekId: rid, year, sourceLabel: str(r.sourceLabel) as string,
              jan: m0(r.jan), feb: m0(r.feb), mar: m0(r.mar), apr: m0(r.apr),
              may: m0(r.may), jun: m0(r.jun), jul: m0(r.jul), aug: m0(r.aug),
              sep: m0(r.sep), oct: m0(r.oct), nov: m0(r.nov), dec: m0(r.dec),
              sortOrder: i,
            }));
          await tx.weeklyChannelRn.deleteMany({ where: { reportWeekId: rid, year } });
          if (data.length) await tx.weeklyChannelRn.createMany({ data });
          written = data.length;
          break;
        }
        case "sales":
        case "ecommerce": {
          const dept = section.id;
          const data = rows
            .filter((r) => str(r.title) || str(r.notes))
            .map((r, i) => ({
              reportWeekId: rid, department: dept,
              dateLabel: str(r.dateLabel), title: str(r.title), notes: str(r.notes), sortOrder: i,
            }));
          await tx.weeklyActivity.deleteMany({ where: { reportWeekId: rid, department: dept } });
          if (data.length) await tx.weeklyActivity.createMany({ data });
          written = data.length;
          break;
        }
        case "social": {
          const platform = str(input.platform) ?? "Instagram";
          const data = rows
            .map((r) => ({ metricKey: normalizeMetricKey(str(r.metricKey) ?? ""), lastWeek: int(r.lastWeek), thisWeek: int(r.thisWeek) }))
            .filter((r): r is { metricKey: string; lastWeek: number | null; thisWeek: number | null } =>
              r.metricKey != null && (r.lastWeek != null || r.thisWeek != null))
            .map((r, i) => ({ reportWeekId: rid, platform, metricKey: r.metricKey, lastWeek: r.lastWeek, thisWeek: r.thisWeek, sortOrder: i }));
          await tx.weeklySocialMetric.deleteMany({ where: { reportWeekId: rid, platform } });
          if (data.length) await tx.weeklySocialMetric.createMany({ data });
          written = data.length;
          break;
        }
        case "training": {
          const data = rows.filter((r) => str(r.topic)).map((r, i) => ({
            reportWeekId: rid, dateLabel: str(r.dateLabel), topic: str(r.topic) as string,
            duration: str(r.duration), trainer: str(r.trainer), participants: str(r.participants), sortOrder: i,
          }));
          await tx.weeklyTraining.deleteMany({ where: { reportWeekId: rid } });
          if (data.length) await tx.weeklyTraining.createMany({ data });
          written = data.length;
          break;
        }
        case "action_plans": {
          const data = rows.filter((r) => str(r.plan)).map((r, i) => ({
            reportWeekId: rid, category: str(r.category), plan: str(r.plan) as string,
            startLabel: str(r.startLabel), deadlineLabel: str(r.deadlineLabel), remark: str(r.remark), sortOrder: i,
          }));
          await tx.weeklyActionPlan.deleteMany({ where: { reportWeekId: rid } });
          if (data.length) await tx.weeklyActionPlan.createMany({ data });
          written = data.length;
          break;
        }
        case "owner_repeater": {
          const data = rows.filter((r) => str(r.label)).map((r, i) => ({
            reportWeekId: rid, label: str(r.label) as string, roomNights: int(r.roomNights), revenue: money(r.revenue), sortOrder: i,
          }));
          await tx.weeklyOwnerRepeater.deleteMany({ where: { reportWeekId: rid } });
          if (data.length) await tx.weeklyOwnerRepeater.createMany({ data });
          written = data.length;
          break;
        }
        case "owner_channel_mix": {
          const data = rows.filter((r) => str(r.label)).map((r, i) => ({
            reportWeekId: rid, label: str(r.label) as string, rnSold: int(r.rnSold), grossRevenue: money(r.grossRevenue), sortOrder: i,
          }));
          await tx.weeklyOwnerChannelMix.deleteMany({ where: { reportWeekId: rid } });
          if (data.length) await tx.weeklyOwnerChannelMix.createMany({ data });
          written = data.length;
          break;
        }
        default:
          throw new Error(`Unknown section: ${section.id}`);
      }

      await tx.weeklyImport.create({
        data: {
          userId: user && user.id !== "system" ? user.id : null,
          propertyId: report.propertyId,
          reportWeekId: rid,
          source: "ai",
          originalFilename: `ai-import:${section.id}`,
          status: "applied",
          periodLabel: week,
          summary: { section: section.id, rows: written, via: "ai" },
          appliedAt: new Date(),
        },
      });
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Import failed." };
  }

  await logAudit("weekly_ai_import", `${property} ${week}`, { section: section.id, rows: written });
  revalidatePath(`/weekly/${property}/${week}/import`);
  revalidatePath(`/weekly/${property}/${week}/editor`);
  revalidatePath(`/weekly/${property}/${week}/dashboard`);
  return { ok: true, written };
}
