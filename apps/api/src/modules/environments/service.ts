import { isUniqueViolation } from "../../db/executor.ts";
import type { EnvironmentRow } from "../../db/schema.ts";
import { projectNotFound, type AccessChecker } from "../../lib/access.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import { requireUser, actorId, type RequestContext } from "../../lib/request-context.ts";
import type { Repositories, RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";
import {
  assertKeysForEveryActiveMember,
  assertOneForEachApp,
  assertWrappedKeySizes,
  toWrappedKeyRows,
  type WrappedKeyForMember,
} from "./key-rules.ts";
import { applyRotation, type EnvironmentRotation } from "./rotation.ts";

export type CreateEnvironmentInput = {
  id: string;
  name: string;
  isProtected?: boolean | undefined;
  wrappedKeys: WrappedKeyForMember[];
  appEnvironments?:
    Array<{ appId: string; id: string; wrappedKeys: WrappedKeyForMember[] }> | undefined;
};

export function createEnvironmentService(dependencies: {
  repositories: Repositories;
  runInTransaction: RunInTransaction;
  access: AccessChecker;
  clock: Clock;
}) {
  const { repositories, runInTransaction, access, clock } = dependencies;

  return {
    async listEnvironments(context: RequestContext, projectId: string, includeApps: boolean) {
      const actor = context.actor;
      if (actor.type === "token") {
        if (actor.projectId !== projectId) {
          throw projectNotFound();
        }
      } else {
        await access.assertRole(context, projectId, "viewer");
      }
      const all = await repositories.environments.listForProject(projectId);
      // A service token sees only its environment and the layers under it.
      const rows =
        actor.type === "token"
          ? all.filter(
              (row) => row.id === actor.environmentId || actor.layerEnvironmentIds.includes(row.id),
            )
          : all.filter((row) => includeApps || row.appId === null);
      return {
        items: rows.map((row) => ({ ...toEnvironmentDto(row), latestVersion: row.latestVersion })),
      };
    },

    /**
     * Adds a root environment, and the same stage for every app in the same
     * transaction, so all apps keep the same stages (ADR 0018).
     */
    async createEnvironment(
      context: RequestContext,
      projectId: string,
      input: CreateEnvironmentInput,
    ) {
      await access.assertRole(context, projectId, "admin");
      const appEnvironments = input.appEnvironments ?? [];
      assertWrappedKeySizes(input.wrappedKeys, "wrappedKeys");
      for (const [index, appEnvironment] of appEnvironments.entries()) {
        assertWrappedKeySizes(appEnvironment.wrappedKeys, `appEnvironments.${index}.wrappedKeys`);
      }
      const createdBy = requireUser(context.actor).userId;
      try {
        const environment = await runInTransaction(async (transaction) => {
          await transaction.projects.lockForKeyChange(projectId);
          await assertOneForEachApp(transaction, projectId, appEnvironments);
          await assertKeysForEveryActiveMember(transaction, projectId, input.wrappedKeys);
          for (const appEnvironment of appEnvironments) {
            await assertKeysForEveryActiveMember(
              transaction,
              projectId,
              appEnvironment.wrappedKeys,
            );
          }
          const isProtected = input.isProtected ?? false;
          const created = await transaction.environments.create({
            id: input.id,
            projectId,
            appId: null,
            name: input.name,
            isShared: false,
            isProtected,
          });
          await transaction.environments.createMany(
            appEnvironments.map((appEnvironment) => ({
              id: appEnvironment.id,
              projectId,
              appId: appEnvironment.appId,
              name: input.name,
              isShared: false,
              isProtected,
            })),
          );
          await transaction.environments.addWrappedKeys([
            ...toWrappedKeyRows(created.id, input.wrappedKeys, createdBy),
            ...appEnvironments.flatMap((appEnvironment) =>
              toWrappedKeyRows(appEnvironment.id, appEnvironment.wrappedKeys, createdBy),
            ),
          ]);
          await recordAuditEvent(transaction.audit, context, {
            projectId,
            action: "environment.created",
            targetType: "environment",
            targetId: created.id,
            metadata: { name: created.name, apps: appEnvironments.length },
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
        await transaction.projects.lockForKeyChange(environment.projectId);
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
      return { keyVersion: version, wrappedKey: wrappedKey.wrappedKey, sender: wrappedKey.sender };
    },
  };
}

export function toEnvironmentDto(environment: EnvironmentRow) {
  return {
    id: environment.id,
    projectId: environment.projectId,
    appId: environment.appId,
    name: environment.name,
    isShared: environment.isShared,
    isProtected: environment.isProtected,
    currentKeyVersion: environment.currentKeyVersion,
    createdAt: environment.createdAt.toISOString(),
  };
}

export type EnvironmentService = ReturnType<typeof createEnvironmentService>;
