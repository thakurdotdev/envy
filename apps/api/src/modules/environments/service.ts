import { isUniqueViolation } from "../../db/executor.ts";
import type { EnvironmentRow } from "../../db/schema.ts";
import { projectNotFound, type AccessChecker } from "../../lib/access.ts";
import type { Clock } from "../../lib/clock.ts";
import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import { AppError } from "../../lib/errors.ts";
import { requireUser, actorId, type RequestContext } from "../../lib/request-context.ts";
import type { Repositories, RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";
import { applyRotation, type EnvironmentRotation } from "./rotation.ts";

export type CreateEnvironmentInput = {
  name: string;
  isProtected?: boolean | undefined;
  wrappedKeys: Array<{ userId: string; wrappedKey: string }>;
};

export function createEnvironmentService(dependencies: {
  repositories: Repositories;
  runInTransaction: RunInTransaction;
  access: AccessChecker;
  clock: Clock;
}) {
  const { repositories, runInTransaction, access, clock } = dependencies;

  return {
    async listEnvironments(context: RequestContext, projectId: string) {
      const actor = context.actor;
      // A service token may list its own project, and sees only its environment.
      const onlyEnvironmentId = actor.type === "token" ? actor.environmentId : undefined;
      if (actor.type === "token") {
        if (actor.projectId !== projectId) {
          throw projectNotFound();
        }
      } else {
        await access.assertRole(context, projectId, "viewer");
      }
      const rows = (await repositories.environments.listForProject(projectId)).filter(
        (row) => onlyEnvironmentId === undefined || row.id === onlyEnvironmentId,
      );
      return {
        items: rows.map((row) => ({ ...toEnvironmentDto(row), latestVersion: row.latestVersion })),
      };
    },

    async createEnvironment(
      context: RequestContext,
      projectId: string,
      input: CreateEnvironmentInput,
    ) {
      await access.assertRole(context, projectId, "admin");
      for (const [index, recipient] of input.wrappedKeys.entries()) {
        assertBase64UrlBytes(
          recipient.wrappedKey,
          BYTE_SIZES.wrappedEnvKey,
          `wrappedKeys.${index}.wrappedKey`,
        );
      }
      await assertKeysForEveryActiveMember(repositories, projectId, input.wrappedKeys);

      try {
        const environment = await runInTransaction(async (transaction) => {
          const created = await transaction.environments.create({
            projectId,
            name: input.name,
            isShared: false,
            isProtected: input.isProtected ?? false,
          });
          await transaction.environments.addWrappedKeys(
            input.wrappedKeys.map((recipient) => ({
              environmentId: created.id,
              keyVersion: created.currentKeyVersion,
              recipientType: "user" as const,
              recipientId: recipient.userId,
              wrappedKey: recipient.wrappedKey,
              createdBy: requireUser(context.actor).userId,
            })),
          );
          await recordAuditEvent(transaction.audit, context, {
            projectId,
            action: "environment.created",
            targetType: "environment",
            targetId: created.id,
            metadata: { name: created.name },
          });
          return created;
        });
        return { ...toEnvironmentDto(environment), latestVersion: 0 };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(
            "ENVIRONMENT_NAME_TAKEN",
            `This project already has an environment called "${input.name}".`,
            409,
          );
        }
        throw error;
      }
    },

    /** A new key version for one environment, for every active member. */
    async rotate(
      context: RequestContext,
      environmentId: string,
      rotation: Omit<EnvironmentRotation, "environmentId">,
    ) {
      const environment = await access.assertEnvironmentRole(context, environmentId, "admin");
      await runInTransaction(async (transaction) => {
        const recipients = new Set(
          await transaction.members.listActiveUserIds(environment.projectId),
        );
        await applyRotation(
          transaction,
          context,
          environment,
          { ...rotation, environmentId },
          recipients,
          clock.now(),
        );
      });
      return { keyVersion: rotation.newKeyVersion };
    },

    /** The caller's wrapped copy of the environment key. */
    async getWrappedKey(
      context: RequestContext,
      environmentId: string,
      keyVersion: number | undefined,
    ) {
      const environment = await access.assertEnvironmentRole(context, environmentId, "viewer");
      const version = keyVersion ?? environment.currentKeyVersion;
      const wrappedKey = await repositories.environments.findWrappedKey({
        environmentId,
        keyVersion: version,
        recipientType: context.actor.type,
        recipientId: actorId(context.actor),
      });
      if (wrappedKey === undefined) {
        throw new AppError(
          "KEY_NOT_FOUND",
          "You have no key for this environment yet. Ask a project admin to grant you access.",
          404,
        );
      }
      return { keyVersion: version, wrappedKey };
    },
  };
}

// A member without a wrapped key could not read the new environment, and a
// key for a non-member would leak access. So the list must match exactly.
async function assertKeysForEveryActiveMember(
  repositories: Repositories,
  projectId: string,
  wrappedKeys: Array<{ userId: string }>,
): Promise<void> {
  const memberIds = new Set(await repositories.members.listActiveUserIds(projectId));
  const recipientIds = new Set(wrappedKeys.map((recipient) => recipient.userId));
  const matches =
    recipientIds.size === wrappedKeys.length &&
    recipientIds.size === memberIds.size &&
    [...recipientIds].every((userId) => memberIds.has(userId));
  if (!matches) {
    throw new AppError(
      "RECIPIENTS_MISMATCH",
      "Wrap the environment key exactly once for every active member of the project.",
      400,
    );
  }
}

export function toEnvironmentDto(environment: EnvironmentRow) {
  return {
    id: environment.id,
    projectId: environment.projectId,
    name: environment.name,
    isShared: environment.isShared,
    isProtected: environment.isProtected,
    currentKeyVersion: environment.currentKeyVersion,
    createdAt: environment.createdAt.toISOString(),
  };
}

export type EnvironmentService = ReturnType<typeof createEnvironmentService>;
