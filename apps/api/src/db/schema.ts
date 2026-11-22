import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Every key column holds base64url text that only clients can decrypt.
// Nothing in this database is a plaintext secret.

// UUIDv7 ids start with a timestamp, so they sort by creation time.
const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7());

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** What the client stored with the salt to derive the master key. */
export type StoredKdfParams = {
  algorithm: "argon2id13";
  opsLimit: number;
  memLimitBytes: number;
};

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name"),
  githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
  githubLogin: text("github_login").notNull(),
  // Key material is empty until the user sets a master password.
  publicKey: text("public_key"),
  encryptedPrivateKey: text("encrypted_private_key"),
  kdfSalt: text("kdf_salt"),
  kdfParams: jsonb("kdf_params").$type<StoredKdfParams>(),
  recoveryEncryptedPrivateKey: text("recovery_encrypted_private_key"),
  createdAt: createdAt(),
});

export const sessionClient = pgEnum("session_client", ["cli", "web"]);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 of the current refresh token. The token itself is never stored.
    refreshTokenHash: text("refresh_token_hash").notNull(),
    deviceName: text("device_name").notNull(),
    client: sessionClient("client").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [index("sessions_user_id_index").on(table.userId)],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
