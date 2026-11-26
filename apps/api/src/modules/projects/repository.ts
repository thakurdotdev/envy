import { and, desc, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import {
  apps,
  auditLog,
  environmentKeys,
  environments,
  invites,
  members,
  projects,
  secretVersions,
  serviceTokens,
  type MemberRole,
  type ProjectRow,
} from "../../db/schema.ts";

export type ProjectWithRole = ProjectRow & { role: MemberRole };

export function createProjectRepository(executor: Executor) {
  return {
    async create(input: { name: string; slug: string; ownerId: string }): Promise<ProjectRow> {
      const [project] = await executor.insert(projects).values(input).returning();
      if (project === undefined) {
        throw new Error("Saving the project returned no row.");
      }
      return project;
    },

    async findById(projectId: string): Promise<ProjectRow | undefined> {
      const [project] = await executor
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));
      return project;
    },

    /** Projects the user is an active member of, newest first. */
    async listForUser(input: {
      userId: string;
      beforeId: string | undefined;
      limit: number;
    }): Promise<ProjectWithRole[]> {
      const rows = await executor
        .select({ project: projects, role: members.role })
        .from(projects)
        .innerJoin(members, eq(members.projectId, projects.id))
        .where(
          and(
            eq(members.userId, input.userId),
            eq(members.status, "active"),
            isNull(projects.deletedAt),
            input.beforeId === undefined ? undefined : lt(projects.id, input.beforeId),
          ),
        )
        .orderBy(desc(projects.id))
        .limit(input.limit);
      return rows.map((row) => ({ ...row.project, role: row.role }));
    },

    /**
     * Locks the project row until the transaction ends. Changes to who holds
     * the keys (new environments, removals, grants, rotations) take this lock
     * first, so two of them never act on different lists of members.
     */
    async lockForKeyChange(projectId: string): Promise<void> {
      await executor
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
    },

    async rename(projectId: string, name: string): Promise<void> {
      await executor.update(projects).set({ name }).where(eq(projects.id, projectId));
    },

    async softDelete(projectId: string, deletedAt: Date): Promise<void> {
      await executor.update(projects).set({ deletedAt }).where(eq(projects.id, projectId));
    },

    /** Projects this user owns that were deleted at or after `since`, newest first. */
    async listDeletedOwnedBy(ownerId: string, since: Date): Promise<ProjectRow[]> {
      return executor
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.ownerId, ownerId),
            isNotNull(projects.deletedAt),
            gte(projects.deletedAt, since),
          ),
        )
        .orderBy(desc(projects.deletedAt));
    },

    async findDeletedById(projectId: string): Promise<ProjectRow | undefined> {
      const [project] = await executor
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), isNotNull(projects.deletedAt)));
      return project;
    },

    /** Brings a deleted project back. False if it was not deleted (any more). */
    async restore(projectId: string): Promise<boolean> {
      const restored = await executor
        .update(projects)
        .set({ deletedAt: null })
        .where(and(eq(projects.id, projectId), isNotNull(projects.deletedAt)))
        .returning({ id: projects.id });
      return restored.length === 1;
    },

    /**
     * Removes for good every project deleted before `cutoff`, with all its
     * rows, children first. Run inside a transaction. Returns the ids.
     */
    async purgeDeletedBefore(cutoff: Date): Promise<string[]> {
      const expired = await executor
        .select({ id: projects.id })
        .from(projects)
        .where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, cutoff)));
      const projectIds = expired.map((row) => row.id);
      if (projectIds.length === 0) {
        return [];
      }
      const projectEnvironments = executor
        .select({ id: environments.id })
        .from(environments)
        .where(inArray(environments.projectId, projectIds));
      await executor.delete(auditLog).where(inArray(auditLog.projectId, projectIds));
      await executor
        .delete(secretVersions)
        .where(inArray(secretVersions.environmentId, projectEnvironments));
      await executor
        .delete(environmentKeys)
        .where(inArray(environmentKeys.environmentId, projectEnvironments));
      await executor.delete(serviceTokens).where(inArray(serviceTokens.projectId, projectIds));
      await executor.delete(environments).where(inArray(environments.projectId, projectIds));
      await executor.delete(apps).where(inArray(apps.projectId, projectIds));
      await executor.delete(invites).where(inArray(invites.projectId, projectIds));
      await executor.delete(members).where(inArray(members.projectId, projectIds));
      await executor.delete(projects).where(inArray(projects.id, projectIds));
      return projectIds;
    },
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;
