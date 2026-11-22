import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { users, type StoredKdfParams, type UserRow } from "../../db/schema.ts";

export type GitHubProfile = {
  githubId: number;
  login: string;
  name: string | null;
  email: string;
};

export type UserKeyMaterial = {
  publicKey: string;
  encryptedPrivateKey: string;
  recoveryEncryptedPrivateKey: string;
  kdfSalt: string;
  kdfParams: StoredKdfParams;
};

export function createUserRepository(database: Executor) {
  return {
    /** Creates the user on first sign-in, or refreshes their GitHub details. */
    async upsertFromGitHub(profile: GitHubProfile): Promise<UserRow> {
      const [user] = await database
        .insert(users)
        .values({
          githubId: profile.githubId,
          githubLogin: profile.login,
          name: profile.name,
          email: profile.email,
        })
        .onConflictDoUpdate({
          target: users.githubId,
          set: { githubLogin: profile.login, name: profile.name, email: profile.email },
        })
        .returning();
      if (user === undefined) {
        throw new Error("Saving the user returned no row.");
      }
      return user;
    },

    async findById(userId: string): Promise<UserRow | undefined> {
      const [user] = await database.select().from(users).where(eq(users.id, userId));
      return user;
    },

    /**
     * Stores key material only if the user has none yet, in one statement,
     * so two devices setting up at once cannot overwrite each other.
     * Returns false when keys already exist.
     */
    async setKeysIfEmpty(userId: string, keys: UserKeyMaterial): Promise<boolean> {
      const updated = await database
        .update(users)
        .set(keys)
        .where(and(eq(users.id, userId), isNull(users.publicKey)))
        .returning({ id: users.id });
      return updated.length === 1;
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
