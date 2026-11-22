import { t } from "elysia";

export const CreateEnvironmentBody = t.Object(
  {
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
