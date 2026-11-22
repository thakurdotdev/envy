import type { AccessChecker } from "../../lib/access.ts";
import { DEFAULT_PAGE_SIZE, toPage } from "../../lib/pagination.ts";
import type { RequestContext } from "../../lib/request-context.ts";
import type { AuditRepository } from "./repository.ts";

/** What happened. Metadata must never hold a secret value or key. */
export type AuditEvent = {
  projectId: string;
  action:
    | "project.created"
    | "project.renamed"
    | "project.deleted"
    | "environment.created"
    | "environment.rotated"
    | "secrets.read"
    | "secrets.pushed"
    | "member.invited"
    | "member.joined"
    | "member.granted"
    | "member.role_changed"
    | "member.removed";
  targetType: "project" | "environment" | "member";
  targetId: string;
  metadata?: Record<string, string | number | boolean | null>;
};

/** Writes one audit entry through the given repository (which may be in a transaction). */
export async function recordAuditEvent(
  audit: AuditRepository,
  context: RequestContext,
  event: AuditEvent,
): Promise<void> {
  await audit.insert({
    projectId: event.projectId,
    actorType: context.actor.type,
    actorId: context.actor.userId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata ?? null,
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

export function createAuditService(dependencies: {
  audit: AuditRepository;
  access: AccessChecker;
}) {
  const { audit, access } = dependencies;
  return {
    async listForProject(
      context: RequestContext,
      projectId: string,
      page: { cursor?: string | undefined; limit?: number | undefined },
    ) {
      await access.assertRole(context, projectId, "admin");
      const limit = page.limit ?? DEFAULT_PAGE_SIZE;
      const rows = await audit.listForProject({
        projectId,
        beforeId: page.cursor,
        limit: limit + 1,
      });
      return toPage(
        rows,
        limit,
        (row) => ({
          id: row.id,
          actorType: row.actorType,
          actorId: row.actorId,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          metadata: row.metadata,
          ip: row.ip,
          userAgent: row.userAgent,
          createdAt: row.createdAt.toISOString(),
        }),
        (row) => row.id,
      );
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
