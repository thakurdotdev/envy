import { t } from "elysia";

const base64Url = (maxLength: number) =>
  t.String({ minLength: 1, maxLength, pattern: "^[A-Za-z0-9_-]+$" });
const assignableRole = t.Union([t.Literal("admin"), t.Literal("member"), t.Literal("viewer")]);

export const ProjectIdParams = t.Object({ id: t.String({ format: "uuid" }) });
export const MemberIdParams = t.Object({ id: t.String({ format: "uuid" }) });
export const InviteTokenParams = t.Object({ token: t.String({ minLength: 20, maxLength: 100 }) });

export const InviteBody = t.Object(
  {
    email: t.String({ format: "email", maxLength: 320 }),
    role: t.Optional(assignableRole),
  },
  { additionalProperties: false },
);

export const GrantBody = t.Object(
  {
    wrappedKeys: t.Array(
      t.Object(
        {
          environmentId: t.String({ format: "uuid" }),
          keyVersion: t.Integer({ minimum: 1 }),
          wrappedKey: base64Url(200),
        },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
  },
  { additionalProperties: false },
);

export const ChangeRoleBody = t.Object({ role: assignableRole }, { additionalProperties: false });

export const RotationSchema = t.Object(
  {
    environmentId: t.String({ format: "uuid" }),
    newKeyVersion: t.Integer({ minimum: 2 }),
    wrappedKeys: t.Array(
      t.Object(
        { userId: t.String({ format: "uuid" }), wrappedKey: base64Url(200) },
        { additionalProperties: false },
      ),
      { maxItems: 1000 },
    ),
    baseVersion: t.Integer({ minimum: 0 }),
    ciphertext: t.Optional(base64Url(200_000)),
    nonce: t.Optional(base64Url(100)),
  },
  { additionalProperties: false },
);

export const RemoveMemberBody = t.Optional(
  t.Object(
    { rotations: t.Array(RotationSchema, { maxItems: 200 }) },
    { additionalProperties: false },
  ),
);
