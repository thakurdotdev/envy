import {
  decryptSecrets,
  encryptSecrets,
  fromBase64Url,
  toBase64Url,
  type Secrets,
} from "@envy/crypto";
import { fetchEnvKey } from "./env-keys.ts";
import type { EnvironmentSummary } from "./environment.ts";
import type { ApiCaller } from "./session.ts";
import { checkNotRolledBack, rememberEnvironmentVersion } from "./trust.ts";
import type { UnlockedKeys } from "./unlock.ts";

// Every encrypt and decrypt for `envy` commands happens here, on this
// machine. Only ciphertext and wrapped keys go to the API.

export type EnvironmentSecrets = { version: number; secrets: Secrets };

export async function listEnvironments(
  session: ApiCaller,
  projectId: string,
): Promise<EnvironmentSummary[]> {
  const result = await session.call((api) => api.v1.projects({ id: projectId }).environments.get());
  return result.items;
}

/** The latest version of an environment, decrypted. An empty environment is version 0. */
export async function pullEnvironment(
  session: ApiCaller,
  keys: UnlockedKeys,
  projectId: string,
  environment: EnvironmentSummary,
): Promise<EnvironmentSecrets> {
  const { current } = await session.call((api) =>
    api.v1.environments({ id: environment.id }).secrets.get({ query: {} }),
  );
  await checkNotRolledBack(environment, {
    version: current?.version ?? 0,
    keyVersion: environment.currentKeyVersion,
  });
  if (current === null) {
    return { version: 0, secrets: {} };
  }
  const envKey = await fetchEnvKey({
    session,
    keys,
    projectId,
    environment,
    keyVersion: current.keyVersion,
  });
  const secrets = await decryptSecrets(
    {
      ciphertext: await fromBase64Url(current.ciphertext),
      nonce: await fromBase64Url(current.nonce),
    },
    envKey,
    {
      projectId,
      environmentId: environment.id,
      version: current.version,
      keyVersion: current.keyVersion,
    },
  );
  await rememberEnvironmentVersion(environment, {
    version: current.version,
    keyVersion: current.keyVersion,
  });
  return { version: current.version, secrets };
}

/**
 * Encrypts and uploads a new version. Throws a CliError with apiCode
 * VERSION_CONFLICT when someone else pushed after `baseVersion`.
 */
export async function pushEnvironment(input: {
  session: ApiCaller;
  keys: UnlockedKeys;
  projectId: string;
  environment: EnvironmentSummary;
  secrets: Secrets;
  baseVersion: number;
  message?: string;
}): Promise<number> {
  const { session, keys, projectId, environment } = input;
  const keyVersion = environment.currentKeyVersion;
  // A server must not get new secrets encrypted with an older (maybe leaked) key.
  await checkNotRolledBack(environment, { version: input.baseVersion, keyVersion });
  // Checks who made this key: a server that made its own would read the push.
  const envKey = await fetchEnvKey({ session, keys, projectId, environment, keyVersion });
  const encrypted = await encryptSecrets(input.secrets, envKey, {
    projectId,
    environmentId: environment.id,
    version: input.baseVersion + 1,
    keyVersion,
  });
  const body = {
    baseVersion: input.baseVersion,
    keyVersion,
    ciphertext: await toBase64Url(encrypted.ciphertext),
    nonce: await toBase64Url(encrypted.nonce),
    ...(input.message === undefined ? {} : { message: input.message }),
  };
  const created = await session.call((api) =>
    api.v1.environments({ id: environment.id }).secrets.post(body),
  );
  await rememberEnvironmentVersion(environment, { version: created.version, keyVersion });
  return created.version;
}

/** The shared layer first, then the environment on top. */
export function mergeLayers(shared: Secrets, environment: Secrets): Secrets {
  return { ...shared, ...environment };
}

/**
 * What to push to an environment from a file that `envy pull` wrote with the
 * shared layer merged in: keys that came from the shared layer unchanged are
 * left out, so they are not copied into the environment.
 */
export function separateFromShared(input: {
  local: Secrets;
  shared: Secrets;
  remoteEnvironment: Secrets;
}): Secrets {
  const result: Secrets = {};
  for (const [key, value] of Object.entries(input.local)) {
    const cameFromShared =
      Object.hasOwn(input.shared, key) &&
      input.shared[key] === value &&
      !Object.hasOwn(input.remoteEnvironment, key);
    if (!cameFromShared) {
      result[key] = value;
    }
  }
  return result;
}
