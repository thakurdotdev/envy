import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import { sessions, type SessionRow } from "../../db/schema.ts";

export type NewSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceName: string;
  client: "cli" | "web";
  expiresAt: Date;
  lastUsedAt: Date;
};

export function createSessionRepository(database: Database) {
  return {
    async create(session: NewSession): Promise<SessionRow> {
      const [created] = await database.insert(sessions).values(session).returning();
      if (created === undefined) {
        throw new Error("Saving the session returned no row.");
      }
      return created;
    },

    async findById(sessionId: string): Promise<SessionRow | undefined> {
      const [session] = await database.select().from(sessions).where(eq(sessions.id, sessionId));
      return session;
    },

    /**
     * Swaps the refresh token hash, but only if the old hash still matches
     * and the session is not revoked. Done in one statement so that two
     * requests with the same token cannot both succeed.
     */
    async rotateRefreshToken(input: {
      sessionId: string;
      oldHash: string;
      newHash: string;
      expiresAt: Date;
      usedAt: Date;
    }): Promise<boolean> {
      const updated = await database
        .update(sessions)
        .set({
          refreshTokenHash: input.newHash,
          previousRefreshTokenHash: input.oldHash,
          expiresAt: input.expiresAt,
          lastUsedAt: input.usedAt,
        })
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.refreshTokenHash, input.oldHash),
            isNull(sessions.revokedAt),
          ),
        )
        .returning({ id: sessions.id });
      return updated.length === 1;
    },

    async revoke(sessionId: string, revokedAt: Date): Promise<void> {
      await database
        .update(sessions)
        .set({ revokedAt })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },

    async listActiveForUser(userId: string, now: Date): Promise<SessionRow[]> {
      return database
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
        )
        .orderBy(desc(sessions.lastUsedAt));
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
