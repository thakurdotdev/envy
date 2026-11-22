import { and, desc, eq, lt } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { auditLog, type AuditLogRow } from "../../db/schema.ts";

// audit_log is append-only: this file only inserts and reads.

export type NewAuditEntry = {
  projectId: string;
  actorType: "user" | "token";
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  ip: string | null;
  userAgent: string | null;
};

export function createAuditRepository(executor: Executor) {
  return {
    async insert(entry: NewAuditEntry): Promise<void> {
      await executor.insert(auditLog).values(entry);
    },

    /** Newest first. UUIDv7 ids sort by time, so they work as the cursor. */
    async listForProject(input: {
      projectId: string;
      beforeId: string | undefined;
      limit: number;
    }): Promise<AuditLogRow[]> {
      return executor
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.projectId, input.projectId),
            input.beforeId === undefined ? undefined : lt(auditLog.id, input.beforeId),
          ),
        )
        .orderBy(desc(auditLog.id))
        .limit(input.limit);
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
