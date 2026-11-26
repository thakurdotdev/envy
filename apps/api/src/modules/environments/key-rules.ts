import { memberCanRead } from "@envy/shared";
import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import { AppError } from "../../lib/errors.ts";
import type { Repositories } from "../../repositories.ts";

// Checks shared by every request that makes new environment keys: the
// client must wrap each key for exactly the right people and apps.

export type WrappedKeyForMember = { userId: string; wrappedKey: string };

/** The active members who can read an environment (ADR 0019). */
export async function readerIdsOf(
  repositories: Repositories,
  projectId: string,
  environment: { name: string; isShared: boolean },
): Promise<Set<string>> {
  const everyone = await repositories.members.listActiveAccess(projectId);
  return new Set(
    everyone.filter((member) => memberCanRead(member, environment)).map((member) => member.userId),
  );
}

// A reader without a wrapped key could not read the environment, and a key
// for anyone else would leak access. So the list must match exactly.
export async function assertKeysForEveryReader(
  repositories: Repositories,
  projectId: string,
  environment: { name: string; isShared: boolean },
  wrappedKeys: Array<{ userId: string }>,
): Promise<void> {
  const readerIds = await readerIdsOf(repositories, projectId, environment);
  const recipientIds = new Set(wrappedKeys.map((recipient) => recipient.userId));
  const matches =
    recipientIds.size === wrappedKeys.length &&
    recipientIds.size === readerIds.size &&
    [...recipientIds].every((userId) => readerIds.has(userId));
  if (!matches) {
    throw new AppError(
      "RECIPIENTS_MISMATCH",
      `Wrap the ${environment.name} key exactly once for every member who can read it.`,
      400,
    );
  }
}

export function assertWrappedKeySizes(wrappedKeys: WrappedKeyForMember[], field: string): void {
  for (const [index, recipient] of wrappedKeys.entries()) {
    assertBase64UrlBytes(
      recipient.wrappedKey,
      BYTE_SIZES.wrappedEnvKey,
      `${field}.${index}.wrappedKey`,
    );
  }
}

export function toWrappedKeyRows(
  environmentId: string,
  wrappedKeys: WrappedKeyForMember[],
  createdBy: string,
) {
  return wrappedKeys.map((recipient) => ({
    environmentId,
    keyVersion: 1,
    recipientType: "user" as const,
    recipientId: recipient.userId,
    wrappedKey: recipient.wrappedKey,
    createdBy,
  }));
}

// Without this, an app would miss the new stage and `envy run` in that app
// would fail for it, or an older client would add a stage only to the root.
export async function assertOneForEachApp(
  repositories: Repositories,
  projectId: string,
  appEnvironments: Array<{ appId: string }>,
): Promise<void> {
  const appIds = new Set((await repositories.apps.listLive(projectId)).map((app) => app.id));
  const given = new Set(appEnvironments.map((appEnvironment) => appEnvironment.appId));
  const matches =
    given.size === appEnvironments.length &&
    given.size === appIds.size &&
    [...given].every((appId) => appIds.has(appId));
  if (!matches) {
    throw new AppError(
      "APP_ENVIRONMENTS_MISMATCH",
      "A new environment needs the same stage for every app of the project. Update Envy and try again.",
      400,
    );
  }
}
