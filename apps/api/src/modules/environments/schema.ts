import { NAME_PATTERN } from "@envy/shared";
import { t } from "elysia";

// A UUIDv7 made by the client: wrapped keys are bound to the environment id,
// so the id must be known before the environment is created (ADR 0016).
export const ClientEnvironmentId = t.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
});

/** A new environment key wrapped for every active member, made on the client. */
export const WrappedKeysForMembers = t.Array(
  t.Object(
    {
      userId: t.String({ format: "uuid" }),
      wrappedKey: t.String({ minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" }),
    },
    { additionalProperties: false },
  ),
  { minItems: 1, maxItems: 1000 },
);

export const CreateEnvironmentBody = t.Object(
  {
    id: ClientEnvironmentId,
    name: t.String({ minLength: 1, maxLength: 50, pattern: NAME_PATTERN }),
    isProtected: t.Optional(t.Boolean()),
    wrappedKeys: WrappedKeysForMembers,
    /**
     * The same stage for each of the project's apps, so every app keeps
     * every stage (ADR 0018). Required, one per app, when the project has apps.
     */
    appEnvironments: t.Optional(
      t.Array(
        t.Object(
          {
            appId: t.String({ format: "uuid" }),
            id: ClientEnvironmentId,
            wrappedKeys: WrappedKeysForMembers,
          },
          { additionalProperties: false },
        ),
        { maxItems: 200 },
      ),
    ),
  },
  { additionalProperties: false },
);

export const ProjectIdParams = t.Object({ id: t.String({ format: "uuid" }) });
export const EnvironmentIdParams = t.Object({ id: t.String({ format: "uuid" }) });

export const ListEnvironmentsQuery = t.Object({
  /** "true" lists app environments too. Older clients leave it out and see only the root. */
  apps: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
});

export const KeyQuery = t.Object({
  /** Leave out for the current key version. */
  keyVersion: t.Optional(t.Integer({ minimum: 1 })),
});
