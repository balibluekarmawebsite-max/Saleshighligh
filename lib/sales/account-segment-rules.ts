/**
 * Saved account→segment rules (AccountSegmentRule). Keyed by the normalised
 * account NAME, so one rule applies to that booker across every property and
 * period. Read by the ingestion importer and the Market & Accounts fetcher to
 * resolve each account's segment; managed by the admin. Every DB call is guarded
 * so the dashboard still works if the migration hasn't been applied yet (the
 * rule set is just treated as empty → automatic classification).
 */

import { prisma } from "@/lib/prisma";
import { accountKey } from "@/lib/sales/account-segments";

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
