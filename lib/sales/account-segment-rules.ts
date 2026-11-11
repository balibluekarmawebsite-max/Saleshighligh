/**
 * Saved account→segment rules (AccountSegmentRule). Keyed by the normalised
 * account NAME, so one rule applies to that booker across every property and
 * period. Read by the ingestion importer and the Market & Accounts fetcher to
 * resolve each account's segment; managed by the admin. Every DB call is guarded
 * so the dashboard still works if the migration hasn't been applied yet (the
 * rule set is just treated as empty → automatic classification).
 */

import { prisma } from "@/lib/prisma";
import {
  accountKey,
  classifySegment,
  DEFAULT_SEGMENT,
  EXCLUDE_SEGMENT,
  normalizeSegmentCode,
} from "@/lib/sales/account-segments";

export interface SegmentRuleView {
  id: string;
  accountName: string;
  segment: string;
}

/** accountKey → segment code (or EXCLUDE), for the resolver. Empty if unavailable. */
export async function getSegmentRuleMap(): Promise<Map<string, string>> {
  try {
    const rows = await prisma.accountSegmentRule.findMany({ select: { accountKey: true, segment: true } });
    return new Map(rows.map((r) => [r.accountKey, r.segment]));
  } catch {
    return new Map();
  }
}

/** All rules for the admin list (alphabetical). */
export async function listSegmentRules(): Promise<SegmentRuleView[]> {
  try {
    const rows = await prisma.accountSegmentRule.findMany({
      orderBy: { accountName: "asc" },
      select: { id: true, accountName: true, segment: true },
    });
    return rows.map((r) => ({ id: r.id, accountName: r.accountName, segment: r.segment }));
  } catch {
    return [];
  }
}

/** Add or update a rule (idempotent on the normalised account key). */
export async function upsertSegmentRule(
  accountName: string,
  segment: string,
): Promise<{ ok: boolean; message: string }> {
  const name = accountName.trim();
  const key = accountKey(name);
  if (!key) return { ok: false, message: "Account name is required." };
  if (!segment.trim()) return { ok: false, message: "Segment is required." };
  try {
    await prisma.accountSegmentRule.upsert({
      where: { accountKey: key },
      create: { accountKey: key, accountName: name, segment: segment.trim() },
      update: { accountName: name, segment: segment.trim() },
    });
    return { ok: true, message: `Saved “${name}” → ${segment}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save the rule." };
  }
}

/** Remove a rule by id. */
export async function deleteSegmentRule(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    await prisma.accountSegmentRule.delete({ where: { id } });
    return { ok: true, message: "Rule removed." };
  } catch {
    return { ok: false, message: "Could not remove (already gone?)." };
  }
}

export interface AccountOverviewRow {
  accountName: string;
  /** Resolved segment code (a saved rule, else name classification). */
  segment: string;
  hasRule: boolean;
  ruleId: string | null;
  /** No rule AND the classifier fell back to the default — a likely new agent. */
  needsReview: boolean;
  /** Appears in a report's account production (vs. a rule-only entry). */
  inData: boolean;
}

export interface AccountSegmentOverview {
  rows: AccountOverviewRow[];
  total: number;
  noRule: number;
  needsReview: number;
}

/** Every account seen across all reports, merged with the saved rules, so the
 * admin can assign a segment to each (and spot new/unassigned agents). */
export async function getAccountSegmentOverview(): Promise<AccountSegmentOverview> {
  let names: string[] = [];
  try {
    const rows = await prisma.accountProduction.findMany({
      distinct: ["accountName"],
      select: { accountName: true },
      orderBy: { accountName: "asc" },
    });
    names = rows.map((r) => r.accountName);
  } catch {
    names = [];
  }
  const rules = await listSegmentRules();
  const ruleByKey = new Map(rules.map((r) => [accountKey(r.accountName), r]));

  const map = new Map<string, AccountOverviewRow>();
  const add = (name: string, inData: boolean) => {
    const key = accountKey(name);
    if (!key) return;
    const existing = map.get(key);
    if (existing) {
      existing.inData = existing.inData || inData;
      return;
    }
    const rule = ruleByKey.get(key);
    const classified = classifySegment(name);
    const segment = rule ? normalizeSegmentCode(rule.segment) ?? rule.segment : classified;
    map.set(key, {
      accountName: name,
      segment,
      hasRule: !!rule,
      ruleId: rule?.id ?? null,
      needsReview: !rule && classified === DEFAULT_SEGMENT,
      inData,
    });
  };
  for (const n of names) add(n, true);
  for (const r of rules) add(r.accountName, false);

  const rows = [...map.values()].sort(
    (a, b) => Number(b.needsReview) - Number(a.needsReview) || a.accountName.localeCompare(b.accountName),
  );
  return {
    rows,
    total: rows.length,
    noRule: rows.filter((r) => !r.hasRule).length,
    needsReview: rows.filter((r) => r.needsReview).length,
  };
}

/** Create a saved rule for every currently auto-classified account, using its
 * resolved segment — so the list becomes "full" in one click. Returns the count. */
export async function assignAllAuto(): Promise<{ ok: boolean; message: string; assigned: number }> {
  try {
    const { rows } = await getAccountSegmentOverview();
    const auto = rows.filter((r) => !r.hasRule && r.segment !== EXCLUDE_SEGMENT);
    for (const r of auto) {
      await prisma.accountSegmentRule.upsert({
        where: { accountKey: accountKey(r.accountName) },
        create: { accountKey: accountKey(r.accountName), accountName: r.accountName, segment: r.segment },
        update: { accountName: r.accountName, segment: r.segment },
      });
    }
    return { ok: true, message: `Assigned ${auto.length} account(s) to their current segment.`, assigned: auto.length };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not assign.", assigned: 0 };
  }
}
