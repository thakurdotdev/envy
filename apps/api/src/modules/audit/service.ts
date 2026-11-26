import type { AccessChecker } from "../../lib/access.ts";
import { DEFAULT_PAGE_SIZE, toPage } from "../../lib/pagination.ts";
import { actorId, type RequestContext } from "../../lib/request-context.ts";
import type { AuditRepository } from "./repository.ts";

/** What happened. Metadata must never hold a secret value or key. */
export type AuditEvent = {
  projectId: string;
  action:
    | "project.created"
    | "project.renamed"
    | "project.deleted"
    | "project.restored"
    | "app.created"
    | "app.removed"
    | "environment.created"
    | "environment.rotated"
    | "secrets.read"
    | "secrets.pushed"
    | "member.invited"
    | "member.joined"
    | "member.granted"
    | "member.role_changed"
    | "member.removed"
    | "token.created"
    | "token.revoked";
  targetType: "project" | "app" | "environment" | "member" | "token";
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
    actorId: actorId(context.actor),
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
          // "@login" for a person, the token's name for a service token.
          actorName:
            row.actorType === "user"
              ? row.actorLogin === null
                ? null
                : `@${row.actorLogin}`
              : row.actorTokenName,
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
