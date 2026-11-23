import { t } from "elysia";

// A UUIDv7 made by the client: wrapped keys are bound to the environment id,
// so the id must be known before the environment is created (ADR 0016).
export const ClientEnvironmentId = t.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
});

export const CreateEnvironmentBody = t.Object(
  {
    id: ClientEnvironmentId,
    name: t.String({ minLength: 1, maxLength: 50, pattern: "^[a-z0-9]+([-_][a-z0-9]+)*$" }),
    isProtected: t.Optional(t.Boolean()),
    /** The new environment key wrapped for every active member, made on the client. */
    wrappedKeys: t.Array(
      t.Object(
        {
          userId: t.String({ format: "uuid" }),
          wrappedKey: t.String({ minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 1000 },
    ),
  },
  { additionalProperties: false },
);

export const ProjectIdParams = t.Object({ id: t.String({ format: "uuid" }) });
export const EnvironmentIdParams = t.Object({ id: t.String({ format: "uuid" }) });

export const KeyQuery = t.Object({
  /** Leave out for the current key version. */
  keyVersion: t.Optional(t.Integer({ minimum: 1 })),
});
