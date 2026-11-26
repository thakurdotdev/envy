import { NAME_PATTERN } from "@envy/shared";
import { t } from "elysia";
import { ClientEnvironmentId, WrappedKeysForMembers } from "../environments/schema.ts";

export const AppName = t.String({ minLength: 1, maxLength: 50, pattern: NAME_PATTERN });

export const CreateAppBody = t.Object(
  {
    name: AppName,
    /**
     * One environment for each root stage (every root environment except
     * shared), each with a new key wrapped for every active member.
     */
    environments: t.Array(
      t.Object(
        {
          id: ClientEnvironmentId,
          name: t.String({ minLength: 1, maxLength: 50, pattern: NAME_PATTERN }),
          wrappedKeys: WrappedKeysForMembers,
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 50 },
    ),
  },
  { additionalProperties: false },
);

export const ProjectIdParams = t.Object({ id: t.String({ format: "uuid" }) });
export const AppIdParams = t.Object({ id: t.String({ format: "uuid" }) });
