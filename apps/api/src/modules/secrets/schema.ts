import { t } from "elysia";

// Ciphertext only. The objects reject extra fields, so a plaintext field
// added by mistake is refused instead of silently dropped or stored.
export const PushSecretsBody = t.Object(
  {
    /** The latest version the client had when it made this one (0 for none). */
    baseVersion: t.Integer({ minimum: 0 }),
    keyVersion: t.Integer({ minimum: 1 }),
    ciphertext: t.String({ minLength: 1, maxLength: 200_000, pattern: "^[A-Za-z0-9_-]+$" }),
    nonce: t.String({ minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_-]+$" }),
    message: t.Optional(t.String({ maxLength: 500 })),
  },
  { additionalProperties: false },
);

export const EnvironmentIdParams = t.Object({ id: t.String({ format: "uuid" }) });

export const SecretsQuery = t.Object({
  /** Leave out for the latest version. */
  version: t.Optional(t.Integer({ minimum: 1 })),
});

export const VersionsQuery = t.Object({
  /** The version number from `nextCursor`. */
  cursor: t.Optional(t.Integer({ minimum: 1 })),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
});
