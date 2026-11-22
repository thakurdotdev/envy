import { and, desc, eq, lt } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { auditLog, serviceTokens, users, type AuditLogRow } from "../../db/schema.ts";

/** An audit entry plus a readable name for who did it: a GitHub login or a token name. */
export type AuditEntryWithActor = AuditLogRow & {
  actorLogin: string | null;
  actorTokenName: string | null;
};

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
    }): Promise<AuditEntryWithActor[]> {
      const rows = await executor
        .select({
          entry: auditLog,
          actorLogin: users.githubLogin,
          actorTokenName: serviceTokens.name,
        })
        .from(auditLog)
        .leftJoin(users, and(eq(auditLog.actorType, "user"), eq(users.id, auditLog.actorId)))
        .leftJoin(
          serviceTokens,
          and(eq(auditLog.actorType, "token"), eq(serviceTokens.id, auditLog.actorId)),
        )
        .where(
          and(
            eq(auditLog.projectId, input.projectId),
            input.beforeId === undefined ? undefined : lt(auditLog.id, input.beforeId),
          ),
        )
        .orderBy(desc(auditLog.id))
        .limit(input.limit);
      return rows.map((row) => ({
        ...row.entry,
        actorLogin: row.actorLogin,
        actorTokenName: row.actorTokenName,
      }));
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
