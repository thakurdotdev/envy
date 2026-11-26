import { ROOT_APP_NAME } from "@envy/shared";
import { isUniqueViolation } from "../../db/executor.ts";
import type { AppRow } from "../../db/schema.ts";
import type { AccessChecker } from "../../lib/access.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import { requireUser, type RequestContext } from "../../lib/request-context.ts";
import type { Repositories, RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";
import {
  assertKeysForEveryActiveMember,
  assertWrappedKeySizes,
  toWrappedKeyRows,
  type WrappedKeyForMember,
} from "../environments/key-rules.ts";
import { toEnvironmentDto } from "../environments/service.ts";

// An app is one part of a monorepo with its own environments, one for each
// root stage, each with its own key (ADR 0018).

export type CreateAppInput = {
  name: string;
  environments: Array<{ id: string; name: string; wrappedKeys: WrappedKeyForMember[] }>;
};

export function appNotFound(): AppError {
  return new AppError("APP_NOT_FOUND", "There is no such app in this project.", 404);
}

export function createAppService(dependencies: {
  repositories: Repositories;
  runInTransaction: RunInTransaction;
  access: AccessChecker;
  clock: Clock;
}) {
  const { repositories, runInTransaction, access, clock } = dependencies;

  return {
    async listApps(context: RequestContext, projectId: string) {
      await access.assertRole(context, projectId, "viewer");
      const rows = await repositories.apps.listLive(projectId);
      return { items: rows.map(toAppDto) };
    },

    async createApp(context: RequestContext, projectId: string, input: CreateAppInput) {
      await access.assertRole(context, projectId, "admin");
      if (input.name === ROOT_APP_NAME) {
        throw new AppError(
          "APP_NAME_TAKEN",
          `"${ROOT_APP_NAME}" means the project's own environments. Pick another app name.`,
          409,
        );
      }
      for (const [index, environment] of input.environments.entries()) {
        assertWrappedKeySizes(environment.wrappedKeys, `environments.${index}.wrappedKeys`);
      }
      const createdBy = requireUser(context.actor).userId;
      try {
        return await runInTransaction(async (transaction) => {
          await transaction.projects.lockForKeyChange(projectId);
          const stages = await rootStages(transaction, projectId);
          assertOneForEachStage(input.environments, stages);
          for (const environment of input.environments) {
            await assertKeysForEveryActiveMember(transaction, projectId, environment.wrappedKeys);
          }
          const app = await transaction.apps.create({ projectId, name: input.name });
          const environments = await transaction.environments.createMany(
            input.environments.map((environment) => ({
              id: environment.id,
              projectId,
              appId: app.id,
              name: environment.name,
              isShared: false,
              // Production stays protected in every app.
              isProtected: stages.get(environment.name) ?? false,
            })),
          );
          await transaction.environments.addWrappedKeys(
            input.environments.flatMap((environment) =>
              toWrappedKeyRows(environment.id, environment.wrappedKeys, createdBy),
            ),
          );
          await recordAuditEvent(transaction.audit, context, {
            projectId,
            action: "app.created",
            targetType: "app",
            targetId: app.id,
            metadata: { name: app.name },
          });
          return {
            ...toAppDto(app),
            environments: environments.map((row) => ({
              ...toEnvironmentDto(row),
              latestVersion: 0,
            })),
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(
            "APP_NAME_TAKEN",
            `This project already has an app called "${input.name}".`,
            409,
          );
        }
        throw error;
      }
    },

    /**
     * Removes an app: its environments are no longer served, and the service
     * tokens made for them stop working at once.
     */
    async removeApp(context: RequestContext, appId: string): Promise<void> {
      const app = await repositories.apps.findLiveById(appId);
      if (app === undefined) {
        throw appNotFound();
      }
      await access.assertRole(context, app.projectId, "admin", appNotFound);
      const now = clock.now();
      await runInTransaction(async (transaction) => {
        await transaction.projects.lockForKeyChange(app.projectId);
        if (!(await transaction.apps.remove(app.id, now))) {
          throw appNotFound();
        }
        const revoked = await transaction.tokens.revokeForApp(app.id, now);
        for (const token of revoked) {
          await recordAuditEvent(transaction.audit, context, {
            projectId: app.projectId,
            action: "token.revoked",
            targetType: "token",
            targetId: token.id,
            metadata: { name: token.name, reason: "app removed" },
          });
        }
        await recordAuditEvent(transaction.audit, context, {
          projectId: app.projectId,
          action: "app.removed",
          targetType: "app",
          targetId: app.id,
          metadata: { name: app.name },
        });
      });
    },
  };
}

/** Root stage name → is it protected. Every root environment except shared. */
async function rootStages(
  repositories: Repositories,
  projectId: string,
): Promise<Map<string, boolean>> {
  const environments = await repositories.environments.listForProject(projectId);
  return new Map(
    environments
      .filter((environment) => environment.appId === null && !environment.isShared)
      .map((environment) => [environment.name, environment.isProtected]),
  );
}

function assertOneForEachStage(
  environments: Array<{ name: string }>,
  stages: Map<string, boolean>,
) {
  const names = new Set(environments.map((environment) => environment.name));
  const matches =
    names.size === environments.length &&
    names.size === stages.size &&
    [...names].every((name) => stages.has(name));
  if (!matches) {
    throw new AppError(
      "APP_ENVIRONMENTS_MISMATCH",
      `A new app needs exactly one environment for each of: ${[...stages.keys()].join(", ")}.`,
      400,
    );
  }
}

function toAppDto(app: AppRow) {
  return {
    id: app.id,
    projectId: app.projectId,
    name: app.name,
    createdAt: app.createdAt.toISOString(),
  };
}

export type AppService = ReturnType<typeof createAppService>;
