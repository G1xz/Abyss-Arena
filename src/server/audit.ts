import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

export async function writeAuditLog(
  tx: Tx,
  entry: {
    adminId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.adminAuditLog.create({
    data: {
      adminId: entry.adminId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      reason: entry.reason ?? null,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
