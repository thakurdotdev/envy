import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    // Deleted projects are hidden at once and removed for good later.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("projects_owner_id_index").on(table.ownerId),
    // A slug only has to be unique among the owner's projects that still exist.
    uniqueIndex("projects_owner_slug_unique")
      .on(table.ownerId, table.slug)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const memberRole = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const memberStatus = pgEnum("member_status", ["pending", "active"]);

export const members = pgTable(
  "members",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: memberRole("role").notNull(),
    // pending = joined, but nobody has given them the environment keys yet.
    status: memberStatus("status").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("members_project_user_unique").on(table.projectId, table.userId),
    index("members_user_id_index").on(table.userId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    // Stored lower case; only a user with this verified GitHub email can accept.
    email: text("email").notNull(),
    role: memberRole("role").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    // SHA-256 of the invite token. The token itself is only in the link.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("invites_project_id_index").on(table.projectId),
    index("invites_invited_by_index").on(table.invitedBy),
  ],
);

export const environments = pgTable(
  "environments",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    // The "shared" layer: merged under every other environment.
    isShared: boolean("is_shared").notNull().default(false),
    // Protected environments (production) need an explicit choice and a confirmation.
    isProtected: boolean("is_protected").notNull().default(false),
    currentKeyVersion: integer("current_key_version").notNull().default(1),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("environments_project_name_unique").on(table.projectId, table.name)],
);

export const recipientType = pgEnum("recipient_type", ["user", "token"]);

export const environmentKeys = pgTable(
  "environment_keys",
  {
    id: id(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    keyVersion: integer("key_version").notNull(),
    recipientType: recipientType("recipient_type").notNull(),
    recipientId: uuid("recipient_id").notNull(),
    // The environment key sealed to the recipient's public key.
    wrappedKey: text("wrapped_key").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("environment_keys_recipient_unique").on(
      table.environmentId,
      table.keyVersion,
      table.recipientType,
      table.recipientId,
    ),
    index("environment_keys_created_by_index").on(table.createdBy),
  ],
);

// Append-only: repository code never updates or deletes these rows.
export const secretVersions = pgTable(
  "secret_versions",
  {
    id: id(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    version: integer("version").notNull(),
    keyVersion: integer("key_version").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    message: text("message"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("secret_versions_environment_version_unique").on(
      table.environmentId,
      table.version.desc(),
    ),
    index("secret_versions_author_id_index").on(table.authorId),
  ],
);

// A read-only key for CI, for one environment. The server keeps only a hash
// of the token's id part; the private key part never leaves the client.
export const serviceTokens = pgTable(
  "service_tokens",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id),
    name: text("name").notNull(),
    tokenIdHash: text("token_id_hash").notNull().unique(),
    publicKey: text("public_key").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("service_tokens_project_id_index").on(table.projectId),
    index("service_tokens_environment_id_index").on(table.environmentId),
    index("service_tokens_created_by_index").on(table.createdBy),
  ],
);

export const actorType = pgEnum("actor_type", ["user", "token"]);

// Append-only, and never holds secret values: only who did what, and when.
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    actorType: actorType("actor_type").notNull(),
    actorId: uuid("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (table) => [index("audit_log_project_created_index").on(table.projectId, table.createdAt.desc())],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type MemberRole = MemberRow["role"];
export type EnvironmentRow = typeof environments.$inferSelect;
export type SecretVersionRow = typeof secretVersions.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type ServiceTokenRow = typeof serviceTokens.$inferSelect;
