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
  // App environments too (ADR 0018); the caller picks the ones it needs.
  const result = await session.call((api) =>
    api.v1.projects({ id: projectId }).environments.get({ query: { apps: "true" } }),
  );
  return result.items;
}

export type AppSummary = { id: string; name: string };

export async function listApps(session: ApiCaller, projectId: string): Promise<AppSummary[]> {
  const result = await session.call((api) => api.v1.projects({ id: projectId }).apps.get());
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

type PushInput = {
  session: ApiCaller;
  keys: UnlockedKeys;
  projectId: string;
  environment: EnvironmentSummary;
  secrets: Secrets;
  baseVersion: number;
  message?: string;
};

/**
 * Encrypts and uploads a new version. Throws a CliError with apiCode
 * VERSION_CONFLICT when someone else pushed after `baseVersion`.
 */
export async function pushEnvironment(input: PushInput): Promise<number> {
  const body = await encryptPush(input);
  const created = await input.session.call((api) =>
    api.v1.environments({ id: input.environment.id }).secrets.post(body),
  );
  await rememberEnvironmentVersion(input.environment, {
    version: created.version,
    keyVersion: body.keyVersion,
  });
  return created.version;
}

/**
 * Pushes to several environments of the project together (ADR 0018): all
 * are saved, or none is. Returns the new version of each environment.
 */
export async function pushEnvironments(
  pushes: Array<Omit<PushInput, "session" | "keys" | "projectId">>,
  shared: Pick<PushInput, "session" | "keys" | "projectId">,
): Promise<Map<string, number>> {
  const bodies: Array<{ environmentId: string } & Awaited<ReturnType<typeof encryptPush>>> = [];
  for (const push of pushes) {
    bodies.push({
      environmentId: push.environment.id,
      ...(await encryptPush({ ...shared, ...push })),
    });
  }
  const created = await shared.session.call((api) =>
    api.v1.projects({ id: shared.projectId }).secrets.post({ pushes: bodies }),
  );
  const versions = new Map<string, number>();
  for (const item of created.items) {
    versions.set(item.environmentId, item.version);
    const push = pushes.find((candidate) => candidate.environment.id === item.environmentId);
    if (push !== undefined) {
      await rememberEnvironmentVersion(push.environment, {
        version: item.version,
        keyVersion: item.keyVersion,
      });
    }
  }
  return versions;
}

async function encryptPush(input: PushInput) {
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
  return {
    baseVersion: input.baseVersion,
    keyVersion,
    ciphertext: await toBase64Url(encrypted.ciphertext),
    nonce: await toBase64Url(encrypted.nonce),
    ...(input.message === undefined ? {} : { message: input.message }),
  };
}
