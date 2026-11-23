import { and, desc, eq, isNull, lt } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { members, projects, type MemberRole, type ProjectRow } from "../../db/schema.ts";

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
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;
