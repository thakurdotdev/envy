import { createHash, randomBytes } from "node:crypto";
import { isUniqueViolation } from "../../db/executor.ts";
import type { MemberRole } from "../../db/schema.ts";
import type { AccessChecker } from "../../lib/access.ts";
import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import type { RequestContext } from "../../lib/request-context.ts";
import type { Repositories, RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";
import { applyRotation, type EnvironmentRotation } from "../environments/rotation.ts";
import type { MemberWithUser } from "./repository.ts";

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function memberNotFound(): AppError {
  return new AppError("MEMBER_NOT_FOUND", "There is no such member.", 404);
}

function inviteNotFound(): AppError {
  return new AppError(
    "INVITE_NOT_FOUND",
    "This invite does not exist, has expired or was already used.",
    404,
  );
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createMemberService(dependencies: {
  repositories: Repositories;
  runInTransaction: RunInTransaction;
  access: AccessChecker;
  clock: Clock;
  webUrl: string;
}) {
  const { repositories, runInTransaction, access, clock, webUrl } = dependencies;

  /** Finds a member and checks the caller is an admin of the same project. */
  async function findMemberAsAdmin(context: RequestContext, memberId: string) {
    const member = await repositories.members.findById(memberId);
    if (member === undefined) {
      throw memberNotFound();
    }
    await access.assertRole(context, member.projectId, "admin", memberNotFound);
    return member;
  }

  return {
    async listMembers(context: RequestContext, projectId: string) {
      await access.assertRole(context, projectId, "viewer");
      const rows = await repositories.members.listForProject(projectId);
      return { items: rows.map(toMemberDto) };
    },

    /** Makes an invite link. Only someone with this verified email can use it. */
    async invite(
      context: RequestContext,
      projectId: string,
      input: { email: string; role: MemberRole },
    ) {
      await access.assertRole(context, projectId, "admin");
      if (input.role === "owner") {
        throw new AppError("OWNER_CANNOT_CHANGE", "A project has exactly one owner.", 403);
      }
      const email = input.email.trim().toLowerCase();
      const existing = await repositories.members.listForProject(projectId);
      if (existing.some((member) => member.email.toLowerCase() === email)) {
        throw new AppError("ALREADY_MEMBER", `${email} is already in this project.`, 409);
      }
      const token = randomBytes(32).toString("base64url");
      const invite = await runInTransaction(async (transaction) => {
        const created = await transaction.members.createInvite({
          projectId,
          email,
          role: input.role,
          invitedBy: context.actor.userId,
          tokenHash: hashInviteToken(token),
          expiresAt: new Date(clock.now().getTime() + INVITE_LIFETIME_MS),
        });
        await recordAuditEvent(transaction.audit, context, {
          projectId,
          action: "member.invited",
          targetType: "project",
          targetId: projectId,
          metadata: { email, role: input.role },
        });
        return created;
      });
      return {
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        // Shown once. The server keeps only its hash.
        token,
        url: `${webUrl}/invite?token=${token}`,
      };
    },

    async acceptInvite(context: RequestContext, token: string) {
      const invite = await repositories.members.findInviteByTokenHash(hashInviteToken(token));
      const isUsable =
        invite !== undefined && invite.acceptedAt === null && invite.expiresAt > clock.now();
      if (!isUsable) {
        throw inviteNotFound();
      }
      const project = await repositories.projects.findById(invite.projectId);
      const user = await repositories.users.findById(context.actor.userId);
      if (project === undefined || user === undefined) {
        throw inviteNotFound();
      }
      if (user.email.toLowerCase() !== invite.email) {
        throw new AppError(
          "INVITE_EMAIL_MISMATCH",
          `This invite is for ${invite.email}, but you are signed in as ${user.email}.`,
          403,
        );
      }
      if (user.publicKey === null) {
        throw new AppError(
          "KEYS_NOT_SET",
          "Finish setting up your keys first: run envy login.",
          409,
        );
      }
      if ((await repositories.members.findMembership(project.id, user.id)) !== undefined) {
        throw new AppError("ALREADY_MEMBER", "You are already in this project.", 409);
      }
      try {
        await runInTransaction(async (transaction) => {
          if (!(await transaction.members.markInviteAccepted(invite.id, clock.now()))) {
            throw inviteNotFound();
          }
          await transaction.members.add({
            projectId: project.id,
            userId: user.id,
            role: invite.role,
            status: "pending",
          });
          await recordAuditEvent(transaction.audit, context, {
            projectId: project.id,
            action: "member.joined",
            targetType: "project",
            targetId: project.id,
            metadata: { role: invite.role },
          });
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError("ALREADY_MEMBER", "You are already in this project.", 409);
        }
        throw error;
      }
      return {
        projectId: project.id,
        projectName: project.name,
        role: invite.role,
        status: "pending" as const,
        publicKey: user.publicKey,
      };
    },

    /** Gives a pending member the keys: one wrapped key per environment, made by the admin's client. */
    async grant(
      context: RequestContext,
      memberId: string,
      wrappedKeys: Array<{ environmentId: string; keyVersion: number; wrappedKey: string }>,
    ) {
      const member = await findMemberAsAdmin(context, memberId);
      if (member.status !== "pending") {
        throw new AppError("MEMBER_NOT_PENDING", `@${member.githubLogin} already has access.`, 409);
      }
      if (member.publicKey === null) {
        throw new AppError(
          "KEYS_NOT_SET",
          `@${member.githubLogin} has not set up their keys yet.`,
          409,
        );
      }
      const environments = await repositories.environments.listForProject(member.projectId);
      const expected = new Map(
        environments.map((environment) => [environment.id, environment.currentKeyVersion]),
      );
      const coversEveryEnvironment =
        wrappedKeys.length === expected.size &&
        new Set(wrappedKeys.map((key) => key.environmentId)).size === expected.size &&
        wrappedKeys.every((key) => expected.get(key.environmentId) === key.keyVersion);
      if (!coversEveryEnvironment) {
        throw new AppError(
          "RECIPIENTS_MISMATCH",
          "Send one wrapped key for every environment, at its current key version.",
          400,
        );
      }
      for (const key of wrappedKeys) {
        assertBase64UrlBytes(key.wrappedKey, BYTE_SIZES.wrappedEnvKey, "wrappedKey");
      }
      await runInTransaction(async (transaction) => {
        await transaction.environments.addWrappedKeys(
          wrappedKeys.map((key) => ({
            environmentId: key.environmentId,
            keyVersion: key.keyVersion,
            recipientType: "user" as const,
            recipientId: member.userId,
            wrappedKey: key.wrappedKey,
            createdBy: context.actor.userId,
          })),
        );
        if (!(await transaction.members.activate(member.memberId))) {
          throw new AppError(
            "MEMBER_NOT_PENDING",
            `@${member.githubLogin} already has access.`,
            409,
          );
        }
        await recordAuditEvent(transaction.audit, context, {
          projectId: member.projectId,
          action: "member.granted",
          targetType: "member",
          targetId: member.memberId,
          metadata: { githubLogin: member.githubLogin },
        });
      });
      return toMemberDto({ ...member, status: "active" });
    },

    async changeRole(context: RequestContext, memberId: string, role: MemberRole) {
      const member = await findMemberAsAdmin(context, memberId);
      if (member.role === "owner" || role === "owner") {
        throw new AppError(
          "OWNER_CANNOT_CHANGE",
          "The owner's role cannot be given or taken here.",
          403,
        );
      }
      await runInTransaction(async (transaction) => {
        await transaction.members.updateRole(memberId, role);
        await recordAuditEvent(transaction.audit, context, {
          projectId: member.projectId,
          action: "member.role_changed",
          targetType: "member",
          targetId: memberId,
          metadata: { githubLogin: member.githubLogin, from: member.role, to: role },
        });
      });
      return toMemberDto({ ...member, role });
    },

    /**
     * Removes a member. An active member could read every environment, so
     * the same request must rotate every environment's key for the people
     * who stay; the removal and the rotations succeed or fail together.
     */
    async remove(context: RequestContext, memberId: string, rotations: EnvironmentRotation[]) {
      const member = await findMemberAsAdmin(context, memberId);
      if (member.role === "owner") {
        throw new AppError("OWNER_CANNOT_CHANGE", "The owner cannot be removed.", 403);
      }
      const environments = await repositories.environments.listForProject(member.projectId);
      const needsRotation = member.status === "active";
      const rotationFor = new Map(rotations.map((rotation) => [rotation.environmentId, rotation]));
      const coversEveryEnvironment = needsRotation
        ? rotationFor.size === rotations.length &&
          rotations.length === environments.length &&
          environments.every((environment) => rotationFor.has(environment.id))
        : rotations.length === 0;
      if (!coversEveryEnvironment) {
        throw new AppError(
          "ROTATION_MISMATCH",
          needsRotation
            ? "Removing an active member needs a key rotation for every environment."
            : "This member never had keys, so send no rotations.",
          400,
        );
      }
      await runInTransaction(async (transaction) => {
        await transaction.members.remove(member.memberId);
        const remaining = new Set(await transaction.members.listActiveUserIds(member.projectId));
        for (const environment of environments) {
          const rotation = rotationFor.get(environment.id);
          if (rotation !== undefined) {
            await applyRotation(transaction, context, environment, rotation, remaining);
          }
        }
        await recordAuditEvent(transaction.audit, context, {
          projectId: member.projectId,
          action: "member.removed",
          targetType: "member",
          targetId: member.memberId,
          metadata: { githubLogin: member.githubLogin },
        });
      });
    },
  };
}

function toMemberDto(member: MemberWithUser) {
  return {
    id: member.memberId,
    userId: member.userId,
    githubLogin: member.githubLogin,
    email: member.email,
    name: member.name,
    role: member.role,
    status: member.status,
    // Clients compute the fingerprint themselves; a server-made one could lie.
    publicKey: member.publicKey,
    createdAt: member.createdAt.toISOString(),
  };
}

export type MemberService = ReturnType<typeof createMemberService>;
