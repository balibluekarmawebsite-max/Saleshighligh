/**
 * Shared write core for the weekly Data Import.
 *
 * Takes already-extracted rows for ONE section and writes them with
 * replace-all semantics (delete the section's existing rows, insert the new
 * ones) inside a single transaction, plus a `WeeklyImport` audit row. This is
 * the single source of truth for "apply a section import", used by both the
 * interactive UI action (`applyAiImport`, which gates on the signed-in user)
 * and the token-gated push endpoint (`runApiImport`, which gates on a shared
 * secret). It performs NO auth and NO report lookup — callers do that and pass
 * a resolved report id.
 *
 * NOTE: this module is intentionally NOT a "use server" action — it must never
 * be directly callable from the browser, since it skips the per-user access
 * check. Only call it from a server context that has already authorised the
 * write.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAiImportSection } from "@/lib/weekly/import/ai-sections";

export type ImportRow = Record<string, string>;

/** Trimmed string or null. */
const str = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
/** Integer (strips separators) or null. */
const int = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim().replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
};
/** Plain money number (strips separators) or null. */
const money = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim().replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
/** Percent 0–100 → 0–1 fraction (4 dp) or null. */
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

export interface ApplyImportInput {
  /** The target weekly report id (caller resolves/creates it). */
  reportId: string;
  /** The report's property id (for the WeeklyImport audit row). */
  propertyId: string;
  /** Internal section id (monthly, segment, …) — see AI_IMPORT_SECTIONS. */
  sectionId: string;
  rows: ImportRow[];
  /** Target year (channel section only). */
  year?: number;
  /** Target platform (social section only). */
  platform?: string;
  /** User id to attribute the import to, or null for a system/API push. */
  actorUserId?: string | null;
  /** Where the push came from, e.g. "ai" (UI) or "api" (scraper). */
  source: string;
  /** Original filename / source label for the audit row. */
  originalFilename: string;
  /** Period label stored on the audit row (the week id). */
  periodLabel: string;
}

/**
 * Write the rows for one section (replace-all) inside a transaction, plus a
 * `WeeklyImport` audit row. Returns the number of rows written. Throws on an
 * unknown section or any DB error (callers wrap it).
 */
export async function applyImportRows(input: ApplyImportInput): Promise<number> {
  const section = getAiImportSection(input.sectionId);
  if (!section) throw new Error(`Unknown section: ${input.sectionId}`);

  const rows = Array.isArray(input.rows) ? input.rows : [];
  const rid = input.reportId;
  let written = 0;

  // Guard: never replace a section's existing rows with nothing. If the mapped
  // rows come out empty (bad file / all rows filtered out), skip the delete so
  // existing data is left intact — the caller surfaces "0 written". This sits
  // next to the delete, inside the transaction, because the real emptiness is
  // only known AFTER the per-section filter (not from the raw extracted rows).
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
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyMonthlyStat.deleteMany({ where: { reportWeekId: rid } });
        await tx.weeklyMonthlyStat.createMany({ data });
        written = data.length;
        break;
      }
      case "segment": {
        const data = rows.filter((r) => str(r.label)).map((r, i) => ({
          reportWeekId: rid, label: str(r.label) as string, segmentGroup: str(r.segmentGroup),
          rnSold: int(r.rnSold), grossRevenue: money(r.grossRevenue), sortOrder: i,
        }));
        if (data.length === 0) { written = 0; break; }
        await tx.weeklySegmentProduction.deleteMany({ where: { reportWeekId: rid } });
        await tx.weeklySegmentProduction.createMany({ data });
        written = data.length;
        break;
      }
      case "ratecode": {
        const data = rows.filter((r) => str(r.label)).map((r, i) => ({
          reportWeekId: rid, label: str(r.label) as string,
          rnSold: int(r.rnSold), grossRevenue: money(r.grossRevenue), sortOrder: i,
        }));
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyRateCodeProduction.deleteMany({ where: { reportWeekId: rid } });
        await tx.weeklyRateCodeProduction.createMany({ data });
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
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyChannelRn.deleteMany({ where: { reportWeekId: rid, year } });
        await tx.weeklyChannelRn.createMany({ data });
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
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyActivity.deleteMany({ where: { reportWeekId: rid, department: dept } });
        await tx.weeklyActivity.createMany({ data });
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
        if (data.length === 0) { written = 0; break; }
        await tx.weeklySocialMetric.deleteMany({ where: { reportWeekId: rid, platform } });
        await tx.weeklySocialMetric.createMany({ data });
        written = data.length;
        break;
      }
      case "training": {
        const data = rows.filter((r) => str(r.topic)).map((r, i) => ({
          reportWeekId: rid, dateLabel: str(r.dateLabel), topic: str(r.topic) as string,
          duration: str(r.duration), trainer: str(r.trainer), participants: str(r.participants), sortOrder: i,
        }));
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyTraining.deleteMany({ where: { reportWeekId: rid } });
        await tx.weeklyTraining.createMany({ data });
        written = data.length;
        break;
      }
      case "action_plans": {
        const data = rows.filter((r) => str(r.plan)).map((r, i) => ({
          reportWeekId: rid, category: str(r.category), plan: str(r.plan) as string,
          startLabel: str(r.startLabel), deadlineLabel: str(r.deadlineLabel), remark: str(r.remark), sortOrder: i,
        }));
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyActionPlan.deleteMany({ where: { reportWeekId: rid } });
        await tx.weeklyActionPlan.createMany({ data });
        written = data.length;
        break;
      }
      case "owner_repeater": {
        const data = rows.filter((r) => str(r.label)).map((r, i) => ({
          reportWeekId: rid, label: str(r.label) as string, roomNights: int(r.roomNights), revenue: money(r.revenue), sortOrder: i,
        }));
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyOwnerRepeater.deleteMany({ where: { reportWeekId: rid } });
        await tx.weeklyOwnerRepeater.createMany({ data });
        written = data.length;
        break;
      }
      case "owner_channel_mix": {
        const data = rows.filter((r) => str(r.label)).map((r, i) => ({
          reportWeekId: rid, label: str(r.label) as string, rnSold: int(r.rnSold), grossRevenue: money(r.grossRevenue), sortOrder: i,
        }));
        if (data.length === 0) { written = 0; break; }
        await tx.weeklyOwnerChannelMix.deleteMany({ where: { reportWeekId: rid } });
        await tx.weeklyOwnerChannelMix.createMany({ data });
        written = data.length;
        break;
      }
      default:
        throw new Error(`Unknown section: ${section.id}`);
    }

    // Nothing valid to write → don't create a misleading audit row either.
    if (written === 0) return;

    const summary: Prisma.InputJsonValue = { section: section.id, rows: written, via: input.source };
    await tx.weeklyImport.create({
      data: {
        userId: input.actorUserId && input.actorUserId !== "system" ? input.actorUserId : null,
        propertyId: input.propertyId,
        reportWeekId: rid,
        source: input.source,
        originalFilename: input.originalFilename,
        status: "applied",
        periodLabel: input.periodLabel,
        summary,
        appliedAt: new Date(),
      },
    });
  });

  return written;
}
