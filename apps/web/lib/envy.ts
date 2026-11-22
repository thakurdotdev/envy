import {
  clearKey,
  decryptPrivateKey,
  decryptSecrets,
  DEFAULT_KDF_PARAMS,
  deriveMasterKey,
  encryptPrivateKey,
  encryptSecrets,
  fromBase64Url,
  generateEnvKey,
  generateRecoveryKey,
  generateSalt,
  generateUserKeys,
  getPublicKey,
  toBase64Url,
  unwrapEnvKey,
  wrapEnvKey,
  type KdfParams,
  type Secrets,
} from "@envy/crypto";
import { ApiError, call } from "./api";

// Every encrypt and decrypt the dashboard does happens here, in the browser,
// with packages/crypto (the same code the CLI uses). Only ciphertext and
// wrapped keys are sent to the API.

export type UnlockedKeys = { publicKey: Uint8Array; privateKey: Uint8Array };

export type EnvironmentSummary = {
  id: string;
  name: string;
  isShared: boolean;
  isProtected: boolean;
  currentKeyVersion: number;
  latestVersion: number;
};

export type StoredKeys = {
  encryptedPrivateKey: string;
  kdfSalt: string;
  kdfParams: KdfParams;
};

export const MINIMUM_PASSWORD_LENGTH = 10;

/** First set-up on this account: returns the recovery key text to show once. */
export async function setUpKeys(
  password: string,
): Promise<{ keys: UnlockedKeys; recoveryKeyText: string }> {
  const { publicKey, privateKey } = await generateUserKeys();
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey(password, salt, DEFAULT_KDF_PARAMS);
  const recovery = await generateRecoveryKey();
  try {
    const body = {
      publicKey: await toBase64Url(publicKey),
      encryptedPrivateKey: await toBase64Url(await encryptPrivateKey(privateKey, masterKey)),
      recoveryEncryptedPrivateKey: await toBase64Url(
        await encryptPrivateKey(privateKey, recovery.key),
      ),
      kdfSalt: await toBase64Url(salt),
      kdfParams: DEFAULT_KDF_PARAMS,
    };
    await call((api) => api.v1.me.keys.put(body));
  } finally {
    await clearKey(masterKey);
    await clearKey(recovery.key);
  }
  return { keys: { publicKey, privateKey }, recoveryKeyText: recovery.text };
}

/** Throws a CryptoError with DECRYPTION_FAILED for a wrong password. */
export async function unlockKeys(password: string, stored: StoredKeys): Promise<UnlockedKeys> {
  const masterKey = await deriveMasterKey(
    password,
    await fromBase64Url(stored.kdfSalt),
    stored.kdfParams,
  );
  try {
    const privateKey = await decryptPrivateKey(
      await fromBase64Url(stored.encryptedPrivateKey),
      masterKey,
    );
    return { privateKey, publicKey: await getPublicKey(privateKey) };
  } finally {
    await clearKey(masterKey);
  }
}

export async function createProject(keys: UnlockedKeys, name: string) {
  const environmentKeys = { shared: "", development: "", staging: "", production: "" };
  for (const environmentName of ["shared", "development", "staging", "production"] as const) {
    const envKey = await generateEnvKey();
    environmentKeys[environmentName] = await toBase64Url(await wrapEnvKey(envKey, keys.publicKey));
    await clearKey(envKey);
  }
  return call((api) => api.v1.projects.post({ name, environmentKeys }));
}

export async function listEnvironments(projectId: string): Promise<EnvironmentSummary[]> {
  return (await call((api) => api.v1.projects({ id: projectId }).environments.get())).items;
}

async function getEnvKey(
  keys: UnlockedKeys,
  environmentId: string,
  keyVersion: number,
): Promise<Uint8Array> {
  const result = await call((api) =>
    api.v1.environments({ id: environmentId }).key.get({ query: { keyVersion } }),
  );
  return unwrapEnvKey(await fromBase64Url(result.wrappedKey), keys.privateKey);
}

/** One version (or the latest), decrypted. An empty environment is version 0. */
export async function pullEnvironment(
  keys: UnlockedKeys,
  projectId: string,
  environmentId: string,
  version?: number,
): Promise<{ version: number; secrets: Secrets }> {
  const query = version === undefined ? {} : { version };
  const { current } = await call((api) =>
    api.v1.environments({ id: environmentId }).secrets.get({ query }),
  );
  if (current === null) {
    return { version: 0, secrets: {} };
  }
  const envKey = await getEnvKey(keys, environmentId, current.keyVersion);
  const secrets = await decryptSecrets(
    {
      ciphertext: await fromBase64Url(current.ciphertext),
      nonce: await fromBase64Url(current.nonce),
    },
    envKey,
    { projectId, environmentId, version: current.version, keyVersion: current.keyVersion },
  );
  await clearKey(envKey);
  return { version: current.version, secrets };
}

export async function pushEnvironment(input: {
  keys: UnlockedKeys;
  projectId: string;
  environment: EnvironmentSummary;
  secrets: Secrets;
  baseVersion: number;
  message?: string;
}): Promise<number> {
  const { keys, projectId, environment } = input;
  const keyVersion = environment.currentKeyVersion;
  const envKey = await getEnvKey(keys, environment.id, keyVersion);
  const encrypted = await encryptSecrets(input.secrets, envKey, {
    projectId,
    environmentId: environment.id,
    version: input.baseVersion + 1,
    keyVersion,
  });
  await clearKey(envKey);
  const body = {
    baseVersion: input.baseVersion,
    keyVersion,
    ciphertext: await toBase64Url(encrypted.ciphertext),
    nonce: await toBase64Url(encrypted.nonce),
    ...(input.message === undefined ? {} : { message: input.message }),
  };
  const created = await call((api) =>
    api.v1.environments({ id: environment.id }).secrets.post(body),
  );
  return created.version;
}

export type Member = {
  id: string;
  userId: string;
  githubLogin: string;
  email: string;
  role: string;
  status: "pending" | "active";
  publicKey: string | null;
};

/** Wraps every environment key for a pending member, then activates them. */
export async function grantMember(
  keys: UnlockedKeys,
  projectId: string,
  member: Member,
): Promise<void> {
  if (member.publicKey === null) {
    throw new ApiError("KEYS_NOT_SET", `@${member.githubLogin} has not set up their keys yet.`);
  }
  const memberPublicKey = await fromBase64Url(member.publicKey);
  const wrappedKeys: Array<{ environmentId: string; keyVersion: number; wrappedKey: string }> = [];
  for (const environment of await listEnvironments(projectId)) {
    const envKey = await getEnvKey(keys, environment.id, environment.currentKeyVersion);
    wrappedKeys.push({
      environmentId: environment.id,
      keyVersion: environment.currentKeyVersion,
      wrappedKey: await toBase64Url(await wrapEnvKey(envKey, memberPublicKey)),
    });
    await clearKey(envKey);
  }
  await call((api) => api.v1.members({ id: member.id }).grant.post({ wrappedKeys }));
}

type Rotation = {
  environmentId: string;
  newKeyVersion: number;
  wrappedKeys: Array<{ userId: string; wrappedKey: string }>;
  baseVersion: number;
  ciphertext?: string;
  nonce?: string;
};

/**
 * Removes a member. An active member's removal carries a new key for every
 * environment, wrapped for everyone who stays, with the latest secrets
 * encrypted again; the API applies it all at once.
 */
export async function removeMember(
  keys: UnlockedKeys,
  projectId: string,
  member: Member,
  everyone: Member[],
): Promise<void> {
  if (member.status === "pending") {
    await call((api) => api.v1.members({ id: member.id }).delete({ rotations: [] }));
    return;
  }
  const staying = everyone.filter(
    (candidate) => candidate.id !== member.id && candidate.status === "active",
  );
  const rotations: Rotation[] = [];
  for (const environment of await listEnvironments(projectId)) {
    const newKeyVersion = environment.currentKeyVersion + 1;
    const newEnvKey = await generateEnvKey();
    const wrappedKeys: Rotation["wrappedKeys"] = [];
    for (const recipient of staying) {
      if (recipient.publicKey !== null) {
        wrappedKeys.push({
          userId: recipient.userId,
          wrappedKey: await toBase64Url(
            await wrapEnvKey(newEnvKey, await fromBase64Url(recipient.publicKey)),
          ),
        });
      }
    }
    const latest = await pullEnvironment(keys, projectId, environment.id);
    const rotation: Rotation = {
      environmentId: environment.id,
      newKeyVersion,
      wrappedKeys,
      baseVersion: latest.version,
    };
    if (latest.version > 0) {
      const encrypted = await encryptSecrets(latest.secrets, newEnvKey, {
        projectId,
        environmentId: environment.id,
        version: latest.version + 1,
        keyVersion: newKeyVersion,
      });
      rotation.ciphertext = await toBase64Url(encrypted.ciphertext);
      rotation.nonce = await toBase64Url(encrypted.nonce);
    }
    rotations.push(rotation);
    await clearKey(newEnvKey);
  }
  await call((api) => api.v1.members({ id: member.id }).delete({ rotations }));
}

export function diffKeys(before: Secrets, after: Secrets) {
  const added = Object.keys(after).filter((key) => !Object.hasOwn(before, key));
  const removed = Object.keys(before).filter((key) => !Object.hasOwn(after, key));
  const changed = Object.keys(after).filter(
    (key) => Object.hasOwn(before, key) && before[key] !== after[key],
  );
  return { added: added.toSorted(), changed: changed.toSorted(), removed: removed.toSorted() };
}

/** Eden turns ISO date strings into Date objects at runtime even though the type says string. */
export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
