import { and, asc, eq, isNull, max } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import {
  environmentKeys,
  environments,
  projects,
  secretVersions,
  type EnvironmentRow,
} from "../../db/schema.ts";

export type NewEnvironment = {
  projectId: string;
  name: string;
  isShared: boolean;
  isProtected: boolean;
};

export type NewWrappedKey = {
  environmentId: string;
  keyVersion: number;
  recipientType: "user" | "token";
  recipientId: string;
  wrappedKey: string;
  createdBy: string;
};

export function createEnvironmentRepository(executor: Executor) {
  return {
    async create(input: NewEnvironment): Promise<EnvironmentRow> {
      const [environment] = await executor.insert(environments).values(input).returning();
      if (environment === undefined) {
        throw new Error("Saving the environment returned no row.");
      }
      return environment;
    },

    /** An environment whose project still exists. */
    async findById(environmentId: string): Promise<EnvironmentRow | undefined> {
      const [row] = await executor
        .select({ environment: environments })
        .from(environments)
        .innerJoin(projects, eq(projects.id, environments.projectId))
        .where(and(eq(environments.id, environmentId), isNull(projects.deletedAt)));
      return row?.environment;
    },

    /** Every environment of a project, with its newest secret version (0 if none). */
    async listForProject(projectId: string) {
      const rows = await executor
        .select({ environment: environments, latestVersion: max(secretVersions.version) })
        .from(environments)
        .leftJoin(secretVersions, eq(secretVersions.environmentId, environments.id))
        .where(eq(environments.projectId, projectId))
        .groupBy(environments.id)
        // UUIDv7 ids follow creation order, even within one transaction.
        .orderBy(asc(environments.id));
      return rows.map((row) => ({ ...row.environment, latestVersion: row.latestVersion ?? 0 }));
    },

    async addWrappedKeys(keys: NewWrappedKey[]): Promise<void> {
      if (keys.length > 0) {
        await executor.insert(environmentKeys).values(keys);
      }
    },

    async findWrappedKey(input: {
      environmentId: string;
      keyVersion: number;
      recipientType: "user" | "token";
      recipientId: string;
    }): Promise<string | undefined> {
      const [row] = await executor
        .select({ wrappedKey: environmentKeys.wrappedKey })
        .from(environmentKeys)
        .where(
          and(
            eq(environmentKeys.environmentId, input.environmentId),
            eq(environmentKeys.keyVersion, input.keyVersion),
            eq(environmentKeys.recipientType, input.recipientType),
            eq(environmentKeys.recipientId, input.recipientId),
          ),
        );
      return row?.wrappedKey;
    },
  };
}

export type EnvironmentRepository = ReturnType<typeof createEnvironmentRepository>;
