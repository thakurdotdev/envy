import { and, arrayContains, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { environments, serviceTokens, type ServiceTokenRow } from "../../db/schema.ts";

/** Not revoked and not expired at `now`. */
const isActive = (now: Date) =>
  and(
    isNull(serviceTokens.revokedAt),
    or(isNull(serviceTokens.expiresAt), gt(serviceTokens.expiresAt, now)),
  );

export function createTokenRepository(executor: Executor) {
  return {
    async create(input: {
      projectId: string;
      environmentId: string;
      layerEnvironmentIds: string[];
      name: string;
      tokenIdHash: string;
      publicKey: string;
      createdBy: string;
      expiresAt: Date | null;
    }): Promise<ServiceTokenRow> {
      const [token] = await executor.insert(serviceTokens).values(input).returning();
      if (token === undefined) {
        throw new Error("Saving the token returned no row.");
      }
      return token;
    },

    async findActiveByIdHash(tokenIdHash: string, now: Date): Promise<ServiceTokenRow | undefined> {
      const [token] = await executor
        .select()
        .from(serviceTokens)
        .where(and(eq(serviceTokens.tokenIdHash, tokenIdHash), isActive(now)));
      return token;
    },

    async findById(tokenId: string): Promise<ServiceTokenRow | undefined> {
      const [token] = await executor
        .select()
        .from(serviceTokens)
        .where(eq(serviceTokens.id, tokenId));
      return token;
    },

    async listForProject(projectId: string) {
      return executor
        .select({
          token: serviceTokens,
          environmentName: environments.name,
          environmentAppId: environments.appId,
        })
        .from(serviceTokens)
        .innerJoin(environments, eq(environments.id, serviceTokens.environmentId))
        .where(eq(serviceTokens.projectId, projectId))
        .orderBy(desc(serviceTokens.id));
    },

    /**
     * Tokens that must get the new key when this environment's key is
     * rotated: those made for it, and those that read it as a layer.
     */
    async listActiveForEnvironment(environmentId: string, now: Date): Promise<ServiceTokenRow[]> {
      return executor
        .select()
        .from(serviceTokens)
        .where(
          and(
            or(
              eq(serviceTokens.environmentId, environmentId),
              arrayContains(serviceTokens.layerEnvironmentIds, [environmentId]),
            ),
            isActive(now),
          ),
        );
    },

    /** Revokes every active token made for one of the app's environments, and returns them. */
    async revokeForApp(appId: string, now: Date): Promise<Array<{ id: string; name: string }>> {
      const appEnvironments = executor
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.appId, appId));
      return executor
        .update(serviceTokens)
        .set({ revokedAt: now })
        .where(and(inArray(serviceTokens.environmentId, appEnvironments), isActive(now)))
        .returning({ id: serviceTokens.id, name: serviceTokens.name });
    },

    async revoke(tokenId: string, revokedAt: Date): Promise<void> {
      await executor
        .update(serviceTokens)
        .set({ revokedAt })
        .where(and(eq(serviceTokens.id, tokenId), isNull(serviceTokens.revokedAt)));
    },

    /** Revokes every active token this user made in the project, and returns them. */
    async revokeCreatedBy(
      projectId: string,
      userId: string,
      now: Date,
    ): Promise<Array<{ id: string; name: string; environmentId: string }>> {
      return executor
        .update(serviceTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(serviceTokens.projectId, projectId),
            eq(serviceTokens.createdBy, userId),
            isActive(now),
          ),
        )
        .returning({
          id: serviceTokens.id,
          name: serviceTokens.name,
          environmentId: serviceTokens.environmentId,
        });
    },

    async markUsed(tokenId: string, usedAt: Date): Promise<void> {
      await executor
        .update(serviceTokens)
        .set({ lastUsedAt: usedAt })
        .where(eq(serviceTokens.id, tokenId));
    },
  };
}

export type TokenRepository = ReturnType<typeof createTokenRepository>;
