"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { deleteSegmentRule, upsertSegmentRule } from "@/lib/sales/account-segment-rules";

export interface RuleActionResult {
  ok: boolean;
  message: string;
}

/** Admin-only: add or update an account→segment rule. */
export async function saveSegmentRuleAction(accountName: string, segment: string): Promise<RuleActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only admins can manage segments." };
  const r = await upsertSegmentRule(accountName, segment);
  if (r.ok) revalidatePath("/admin/account-segments");
  return r;
}

/** Admin-only: remove a rule. */
export async function removeSegmentRuleAction(id: string): Promise<RuleActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only admins can manage segments." };
  const r = await deleteSegmentRule(id);
  if (r.ok) revalidatePath("/admin/account-segments");
  return r;
}
