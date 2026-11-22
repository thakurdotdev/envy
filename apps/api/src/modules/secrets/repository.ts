import { and, desc, eq, lt, max } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { secretVersions, users, type SecretVersionRow } from "../../db/schema.ts";

// secret_versions is append-only: this file only inserts and reads.

export function createSecretRepository(executor: Executor) {
  return {
    async latestVersionNumber(environmentId: string): Promise<number> {
      const [row] = await executor
        .select({ latest: max(secretVersions.version) })
        .from(secretVersions)
        .where(eq(secretVersions.environmentId, environmentId));
      return row?.latest ?? 0;
    },

    /** One version, or the newest one when `version` is undefined. */
    async findVersion(
      environmentId: string,
      version: number | undefined,
    ): Promise<SecretVersionRow | undefined> {
      const [row] = await executor
        .select()
        .from(secretVersions)
        .where(
          and(
            eq(secretVersions.environmentId, environmentId),
            version === undefined ? undefined : eq(secretVersions.version, version),
          ),
        )
        .orderBy(desc(secretVersions.version))
        .limit(1);
      return row;
    },

    /** Fails with a unique violation if the version number was taken meanwhile. */
    async insert(input: {
      environmentId: string;
      version: number;
      keyVersion: number;
      ciphertext: string;
      nonce: string;
      authorId: string;
      message: string | null;
    }): Promise<SecretVersionRow> {
      const [row] = await executor.insert(secretVersions).values(input).returning();
      if (row === undefined) {
        throw new Error("Saving the secret version returned no row.");
      }
      return row;
    },

    /** Version metadata, newest first. Never includes ciphertext. */
    async listVersions(input: {
      environmentId: string;
      beforeVersion: number | undefined;
      limit: number;
    }) {
      return executor
        .select({
          version: secretVersions.version,
          keyVersion: secretVersions.keyVersion,
          message: secretVersions.message,
          createdAt: secretVersions.createdAt,
          authorId: secretVersions.authorId,
          authorLogin: users.githubLogin,
        })
        .from(secretVersions)
        .innerJoin(users, eq(users.id, secretVersions.authorId))
        .where(
          and(
            eq(secretVersions.environmentId, input.environmentId),
            input.beforeVersion === undefined
              ? undefined
              : lt(secretVersions.version, input.beforeVersion),
          ),
        )
        .orderBy(desc(secretVersions.version))
        .limit(input.limit);
    },
  };
}

export type SecretRepository = ReturnType<typeof createSecretRepository>;
