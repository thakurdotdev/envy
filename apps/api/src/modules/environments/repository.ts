import { and, asc, eq, isNull, max, or } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import {
  apps,
  environmentKeys,
  environments,
  projects,
  secretVersions,
  users,
  type EnvironmentRow,
} from "../../db/schema.ts";

export type NewEnvironment = {
  /** Chosen by the client, so wrapped keys can be bound to it before it exists (ADR 0016). */
  id: string;
  projectId: string;
  /** Null for a root environment. */
  appId: string | null;
  name: string;
  isShared: boolean;
  isProtected: boolean;
};

// A root environment, or one whose app has not been removed (ADR 0018).
const appIsLive = or(isNull(environments.appId), isNull(apps.deletedAt));

export type NewWrappedKey = {
  environmentId: string;
  keyVersion: number;
  recipientType: "user" | "token";
  recipientId: string;
  wrappedKey: string;
  createdBy: string;
};

/** A wrapped key and who made it. Clients check the maker before trusting it. */
export type WrappedKeyWithSender = {
  wrappedKey: string;
  sender: { userId: string; githubLogin: string; publicKey: string };
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

    async createMany(inputs: NewEnvironment[]): Promise<EnvironmentRow[]> {
      if (inputs.length === 0) {
        return [];
      }
      return executor.insert(environments).values(inputs).returning();
    },

    /** An environment whose project (and app, if it has one) still exists. */
    async findById(environmentId: string): Promise<EnvironmentRow | undefined> {
      const [row] = await executor
        .select({ environment: environments })
        .from(environments)
        .innerJoin(projects, eq(projects.id, environments.projectId))
        .leftJoin(apps, eq(apps.id, environments.appId))
        .where(and(eq(environments.id, environmentId), isNull(projects.deletedAt), appIsLive));
      return row?.environment;
    },

    /**
     * Every environment of a project, root and app ones (not those of removed
     * apps), with its newest secret version (0 if none).
     */
    async listForProject(projectId: string) {
      const rows = await executor
        .select({ environment: environments, latestVersion: max(secretVersions.version) })
        .from(environments)
        .leftJoin(apps, eq(apps.id, environments.appId))
        .leftJoin(secretVersions, eq(secretVersions.environmentId, environments.id))
        .where(and(eq(environments.projectId, projectId), appIsLive))
        .groupBy(environments.id)
        // UUIDv7 ids follow creation order, even within one transaction.
        .orderBy(asc(environments.id));
      return rows.map((row) => ({ ...row.environment, latestVersion: row.latestVersion ?? 0 }));
    },

    /**
     * Moves an environment to a new key version, only if it is still on
     * `fromVersion`, so two rotations at once cannot both succeed.
     */
    async advanceKeyVersion(environmentId: string, fromVersion: number): Promise<boolean> {
      const updated = await executor
        .update(environments)
        .set({ currentKeyVersion: fromVersion + 1 })
        .where(
          and(eq(environments.id, environmentId), eq(environments.currentKeyVersion, fromVersion)),
        )
        .returning({ id: environments.id });
      return updated.length === 1;
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
    }): Promise<WrappedKeyWithSender | undefined> {
      const [row] = await executor
        .select({
          wrappedKey: environmentKeys.wrappedKey,
          senderId: users.id,
          senderGithubLogin: users.githubLogin,
          senderPublicKey: users.publicKey,
        })
        .from(environmentKeys)
        .innerJoin(users, eq(users.id, environmentKeys.createdBy))
        .where(
          and(
            eq(environmentKeys.environmentId, input.environmentId),
            eq(environmentKeys.keyVersion, input.keyVersion),
            eq(environmentKeys.recipientType, input.recipientType),
            eq(environmentKeys.recipientId, input.recipientId),
          ),
        );
      if (row === undefined) {
        return undefined;
      }
      return {
        wrappedKey: row.wrappedKey,
        sender: {
          userId: row.senderId,
          githubLogin: row.senderGithubLogin,
          publicKey: row.senderPublicKey ?? "",
        },
      };
    },
  };
}

export type EnvironmentRepository = ReturnType<typeof createEnvironmentRepository>;
