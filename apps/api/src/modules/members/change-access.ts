import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import { requireUser, type RequestContext } from "../../lib/request-context.ts";
import type { RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";
import { readerIdsOf } from "../environments/key-rules.ts";
import { applyRotation, type EnvironmentRotation } from "../environments/rotation.ts";
import {
  assertKeysForEnvironments,
  assertRotationsFor,
  checkAccessList,
  describeAccess,
  readableEnvironments,
} from "./access.ts";
import type { MemberWithUser } from "./repository.ts";

export type ChangeAccessInput = {
  /** Null: every environment. Otherwise the stage names (ADR 0019). */
  access: string[] | null;
  /** Keys for the environments the member gains, at their current key versions. */
  wrappedKeys: Array<{ environmentId: string; keyVersion: number; wrappedKey: string }>;
  /** A new key for each environment the member loses, for everyone who keeps it. */
  rotations: EnvironmentRotation[];
};

/**
 * Changes which environments a member can read, all in one transaction:
 * keys for what they gain, and a rotation of what they lose, so the key
 * they still hold opens nothing new.
 */
export async function changeMemberAccess(
  dependencies: { runInTransaction: RunInTransaction; clock: Clock },
  context: RequestContext,
  projectMember: MemberWithUser,
  input: ChangeAccessInput,
): Promise<string[] | null> {
  for (const key of input.wrappedKeys) {
    assertBase64UrlBytes(key.wrappedKey, BYTE_SIZES.wrappedEnvKey, "wrappedKey");
  }
  return dependencies.runInTransaction(async (transaction) => {
    await transaction.projects.lockForKeyChange(projectMember.projectId);
    // Read again under the lock: a grant or another change may have happened.
    const member = await transaction.members.findById(projectMember.memberId);
    if (member === undefined) {
      throw new AppError("MEMBER_NOT_FOUND", "There is no such member.", 404);
    }
    const access = await checkAccessList(transaction, member.projectId, member.role, input.access);
    const environments = await transaction.environments.listForProject(member.projectId);
    // A pending member holds no keys yet; the grant sends them later.
    const before =
      member.status === "active" ? readableEnvironments(environments, member.access) : [];
    const after = member.status === "active" ? readableEnvironments(environments, access) : [];
    const gained = after.filter((environment) => !before.includes(environment));
    const lost = before.filter((environment) => !after.includes(environment));
    assertKeysForEnvironments(input.wrappedKeys, gained);
    assertRotationsFor(input.rotations, lost);

    await transaction.members.setAccess(member.memberId, access);
    const createdBy = requireUser(context.actor).userId;
    await transaction.environments.addWrappedKeys(
      input.wrappedKeys.map((key) => ({
        environmentId: key.environmentId,
        keyVersion: key.keyVersion,
        recipientType: "user" as const,
        recipientId: member.userId,
        wrappedKey: key.wrappedKey,
        createdBy,
      })),
    );
    const now = dependencies.clock.now();
    for (const environment of lost) {
      const rotation = input.rotations.find(
        (candidate) => candidate.environmentId === environment.id,
      );
      if (rotation === undefined) {
        throw new AppError("ROTATION_MISMATCH", `Rotate ${environment.name} too.`, 400);
      }
      // Read after the change, so the member is no longer among the recipients.
      const readers = await readerIdsOf(transaction, member.projectId, environment);
      await applyRotation(transaction, context, environment, rotation, readers, now);
    }
    await recordAuditEvent(transaction.audit, context, {
      projectId: member.projectId,
      action: "member.access_changed",
      targetType: "member",
      targetId: member.memberId,
      metadata: {
        githubLogin: member.githubLogin,
        from: describeAccess(member.access),
        to: describeAccess(access),
      },
    });
    return access;
  });
}
