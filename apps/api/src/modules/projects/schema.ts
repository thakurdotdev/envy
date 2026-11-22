import { t } from "elysia";

const wrappedKey = t.String({ minLength: 1, maxLength: 200, pattern: "^[A-Za-z0-9_-]+$" });

export const CreateProjectBody = t.Object(
  {
    name: t.String({ minLength: 1, maxLength: 100 }),
    /** Lower case letters, digits and dashes. Made from the name when left out. */
    slug: t.Optional(
      t.String({ minLength: 1, maxLength: 60, pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" }),
    ),
    /**
     * The new project's four environment keys, each made and wrapped for the
     * owner's public key on the client. The server never sees the keys.
     */
    environmentKeys: t.Object(
      {
        shared: wrappedKey,
        development: wrappedKey,
        staging: wrappedKey,
        production: wrappedKey,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const RenameProjectBody = t.Object(
  { name: t.String({ minLength: 1, maxLength: 100 }) },
  { additionalProperties: false },
);

export const ProjectIdParams = t.Object({ id: t.String({ format: "uuid" }) });
