import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import {
  invites,
  members,
  projects,
  users,
  type InviteRow,
  type MemberRole,
} from "../../db/schema.ts";

export type MemberWithUser = {
  memberId: string;
  projectId: string;
  userId: string;
  role: MemberRole;
  status: "pending" | "active";
  githubLogin: string;
  email: string;
  name: string | null;
  publicKey: string | null;
  createdAt: Date;
};

export function createMemberRepository(executor: Executor) {
  const memberWithUserColumns = {
    memberId: members.id,
    projectId: members.projectId,
    userId: members.userId,
    role: members.role,
    status: members.status,
    githubLogin: users.githubLogin,
    email: users.email,
    name: users.name,
    publicKey: users.publicKey,
    createdAt: members.createdAt,
  };

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

    async findMembership(
      projectId: string,
      userId: string,
    ): Promise<{ status: string } | undefined> {
      const [row] = await executor
        .select({ status: members.status })
        .from(members)
        .where(and(eq(members.projectId, projectId), eq(members.userId, userId)));
      return row;
    },

    async listActiveUserIds(projectId: string): Promise<string[]> {
      const rows = await executor
        .select({ userId: members.userId })
        .from(members)
        .where(and(eq(members.projectId, projectId), eq(members.status, "active")));
      return rows.map((row) => row.userId);
    },

    async listForProject(projectId: string): Promise<MemberWithUser[]> {
      return executor
        .select(memberWithUserColumns)
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .where(eq(members.projectId, projectId))
        .orderBy(asc(members.id));
    },

    /** A member of a project that still exists. */
    async findById(memberId: string): Promise<MemberWithUser | undefined> {
      const [row] = await executor
        .select(memberWithUserColumns)
        .from(members)
        .innerJoin(users, eq(users.id, members.userId))
        .innerJoin(projects, eq(projects.id, members.projectId))
        .where(and(eq(members.id, memberId), isNull(projects.deletedAt)));
      return row;
    },

    /** pending → active, only if still pending. Returns false otherwise. */
    async activate(memberId: string): Promise<boolean> {
      const updated = await executor
        .update(members)
        .set({ status: "active" })
        .where(and(eq(members.id, memberId), eq(members.status, "pending")))
        .returning({ id: members.id });
      return updated.length === 1;
    },

    async updateRole(memberId: string, role: MemberRole): Promise<void> {
      await executor.update(members).set({ role }).where(eq(members.id, memberId));
    },

    async remove(memberId: string): Promise<void> {
      await executor.delete(members).where(eq(members.id, memberId));
    },

    /** How many members are waiting for keys, per project. */
    async countPending(projectIds: string[]): Promise<Map<string, number>> {
      if (projectIds.length === 0) {
        return new Map();
      }
      const rows = await executor
        .select({ projectId: members.projectId, pending: count() })
        .from(members)
        .where(and(inArray(members.projectId, projectIds), eq(members.status, "pending")))
        .groupBy(members.projectId);
      return new Map(rows.map((row) => [row.projectId, row.pending]));
    },

    async createInvite(input: {
      projectId: string;
      email: string;
      role: MemberRole;
      invitedBy: string;
      tokenHash: string;
      expiresAt: Date;
    }): Promise<InviteRow> {
      const [invite] = await executor.insert(invites).values(input).returning();
      if (invite === undefined) {
        throw new Error("Saving the invite returned no row.");
      }
      return invite;
    },

    async findInviteByTokenHash(tokenHash: string): Promise<InviteRow | undefined> {
      const [invite] = await executor
        .select()
        .from(invites)
        .where(eq(invites.tokenHash, tokenHash));
      return invite;
    },

    /** Marks an invite used, only if it was not used yet. */
    async markInviteAccepted(inviteId: string, acceptedAt: Date): Promise<boolean> {
      const updated = await executor
        .update(invites)
        .set({ acceptedAt })
        .where(and(eq(invites.id, inviteId), isNull(invites.acceptedAt)))
        .returning({ id: invites.id });
      return updated.length === 1;
    },
  };
}

export type MemberRepository = ReturnType<typeof createMemberRepository>;
