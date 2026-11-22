import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { members, projects, type MemberRole } from "../../db/schema.ts";

export function createMemberRepository(executor: Executor) {
  return {
    async add(input: {
      projectId: string;
      userId: string;
      role: MemberRole;
      status: "pending" | "active";
    }): Promise<void> {
      await executor.insert(members).values(input);
    },

    /** The user's role in a project that still exists, if they are an active member. */
    async findActiveRole(projectId: string, userId: string): Promise<MemberRole | undefined> {
      const [row] = await executor
        .select({ role: members.role })
        .from(members)
        .innerJoin(projects, eq(projects.id, members.projectId))
        .where(
          and(
            eq(members.projectId, projectId),
            eq(members.userId, userId),
            eq(members.status, "active"),
            isNull(projects.deletedAt),
          ),
        );
      return row?.role;
    },

    async listActiveUserIds(projectId: string): Promise<string[]> {
      const rows = await executor
        .select({ userId: members.userId })
        .from(members)
        .where(and(eq(members.projectId, projectId), eq(members.status, "active")));
      return rows.map((row) => row.userId);
    },
  };
}

export type MemberRepository = ReturnType<typeof createMemberRepository>;
