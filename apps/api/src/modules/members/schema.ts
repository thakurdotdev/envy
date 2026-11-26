import { NAME_PATTERN } from "@envy/shared";
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

const WrappedKeysForEnvironments = t.Array(
  t.Object(
    {
      environmentId: t.String({ format: "uuid" }),
      keyVersion: t.Integer({ minimum: 1 }),
      wrappedKey: base64Url(200),
    },
    { additionalProperties: false },
  ),
  { maxItems: 200 },
);

/** Null: every environment. Otherwise stage names, such as ["development"] (ADR 0019). */
const AccessList = t.Union([
  t.Null(),
  t.Array(t.String({ minLength: 1, maxLength: 50, pattern: NAME_PATTERN }), { maxItems: 50 }),
]);

export const GrantBody = t.Object(
  {
    wrappedKeys: WrappedKeysForEnvironments,
    /** Which stages the member gets. Left out: the access they already have. */
    access: t.Optional(AccessList),
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
    tokenWrappedKeys: t.Optional(
      t.Array(
        t.Object(
          { tokenId: t.String({ format: "uuid" }), wrappedKey: base64Url(200) },
          { additionalProperties: false },
        ),
        { maxItems: 1000 },
      ),
    ),
    baseVersion: t.Integer({ minimum: 0 }),
    ciphertext: t.Optional(base64Url(200_000)),
    nonce: t.Optional(base64Url(100)),
  },
  { additionalProperties: false },
);

export const ChangeAccessBody = t.Object(
  {
    access: AccessList,
    wrappedKeys: WrappedKeysForEnvironments,
    rotations: t.Array(RotationSchema, { maxItems: 200 }),
  },
  { additionalProperties: false },
);

export const RemoveMemberBody = t.Optional(
  t.Object(
    { rotations: t.Array(RotationSchema, { maxItems: 200 }) },
    { additionalProperties: false },
  ),
);
