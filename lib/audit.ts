import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * Append an audit-trail entry (Phase 16). Best-effort — never throws into the
 * caller. The actor is resolved from the current session automatically.
 */
export async function logAudit(action: string, entity?: string, detail?: Prisma.InputJsonValue): Promise<void> {
  try {
    const user = await getCurrentUser();
    await prisma.auditLog.create({
      data: {
        userId: user && user.id !== "system" ? user.id : null,
        userEmail: user?.email ?? null,
        action,
        entity: entity ?? null,
        detail: detail ?? undefined,
      },
    });
  } catch {
    /* auditing must never break the primary action */
  }
}

export interface AuditEntry {
  id: string;
  userEmail: string | null;
  action: string;
  entity: string | null;
  detail: unknown;
  createdAt: Date;
}

/** Recent activity for the admin feed. */
export async function getAuditFeed(limit = 100): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((r) => ({ id: r.id, userEmail: r.userEmail, action: r.action, entity: r.entity, detail: r.detail, createdAt: r.createdAt }));
}
