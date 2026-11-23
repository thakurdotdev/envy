import {
  answerKeyChallenge,
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
  parseRecoveryKey,
  toBase64Url,
  wrapEnvKey,
  type KdfParams,
  type Secrets,
} from "@envy/crypto";
import { newUuidV7s } from "@envy/shared";
import { ApiError, call } from "./api";
import {
  checkNotRolledBack,
  memberKeyOwner,
  openTrustedEnvKey,
  pinConfirmedPublicKeys,
  rememberEnvironmentVersion,
  tokenKeyOwner,
  trustRecipients,
  type KeyPair,
  type WebTrust,
} from "./trust";

// Every encrypt and decrypt the dashboard does happens here, in the browser,
// with packages/crypto (the same code the CLI uses). Only ciphertext and
// wrapped keys are sent to the API.

/** The unlocked key pair, and this account's trust store (ADR 0016). */
export type UnlockedKeys = KeyPair & { trust: WebTrust };

export type EnvironmentSummary = {
  id: string;
  name: string;
  isShared: boolean;
  isProtected: boolean;
  currentKeyVersion: number;
  latestVersion: number;
};

export type StoredKeys = {
  publicKey: string;
  encryptedPrivateKey: string;
  recoveryEncryptedPrivateKey: string;
  kdfSalt: string;
  kdfParams: KdfParams;
};

export const MINIMUM_PASSWORD_LENGTH = 10;

/** First set-up on this account: returns the recovery key text to show once. */
export async function setUpKeys(
  password: string,
): Promise<{ keys: KeyPair; recoveryKeyText: string }> {
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
export async function unlockKeys(password: string, stored: StoredKeys): Promise<KeyPair> {
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

/**
 * Encrypts the private key again with a new master password (and, when
 * asked, a new recovery key) and stores the copies. The keypair stays the
 * same. The server first checks that this browser holds the private key.
 * Returns the new recovery key text when one was made.
 */
export async function storeNewKeyCopies(
  privateKey: Uint8Array,
  newPassword: string,
  newRecoveryKey: boolean,
): Promise<{ recoveryKeyText: string | undefined; stored: StoredKeys }> {
  const challenge = await call((api) => api.v1.me.keys.challenge.post());
  const answer = await answerKeyChallenge(
    await fromBase64Url(challenge.sealedChallenge),
    privateKey,
  );
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey(newPassword, salt, DEFAULT_KDF_PARAMS);
  const recovery = newRecoveryKey ? await generateRecoveryKey() : undefined;
  try {
    const body = {
      challengeToken: challenge.challengeToken,
      challengeAnswer: await toBase64Url(answer),
      encryptedPrivateKey: await toBase64Url(await encryptPrivateKey(privateKey, masterKey)),
      kdfSalt: await toBase64Url(salt),
      kdfParams: DEFAULT_KDF_PARAMS,
      ...(recovery === undefined
        ? {}
        : {
            recoveryEncryptedPrivateKey: await toBase64Url(
              await encryptPrivateKey(privateKey, recovery.key),
            ),
          }),
    };
    const profile = await call((api) => api.v1.me.keys.replace.post(body));
    if (profile.keys === null) {
      throw new ApiError("KEYS_NOT_SET", "This account has no keys yet.");
    }
    return { recoveryKeyText: recovery?.text, stored: profile.keys };
  } finally {
    await clearKey(masterKey);
    if (recovery !== undefined) {
      await clearKey(recovery.key);
    }
  }
}

/**
 * Opens the server's recovery copy of the private key with the recovery key.
 * Throws a CryptoError for a mistyped key (INVALID_RECOVERY_KEY) or one
 * that does not open this account (DECRYPTION_FAILED).
 */
export async function unlockWithRecoveryKey(
  recoveryKeyText: string,
  stored: StoredKeys,
): Promise<KeyPair> {
  const recoveryKey = await parseRecoveryKey(recoveryKeyText);
  try {
    const privateKey = await decryptPrivateKey(
      await fromBase64Url(stored.recoveryEncryptedPrivateKey),
      recoveryKey,
    );
    const publicKey = await getPublicKey(privateKey);
    // A server could send some other encrypted key; it must match the account's public key.
    if ((await toBase64Url(publicKey)) !== stored.publicKey) {
      throw new ApiError("KEYS_NOT_SET", "The server sent a key that is not this account's.");
    }
    return { privateKey, publicKey };
  } finally {
    await clearKey(recoveryKey);
  }
}

/** Wraps an environment key for one recipient, from this user, bound to its place. */
async function wrapFor(
  envKey: Uint8Array,
  keys: KeyPair,
  recipientPublicKey: string | Uint8Array,
  place: { environmentId: string; keyVersion: number },
): Promise<string> {
  const recipient =
    typeof recipientPublicKey === "string"
      ? await fromBase64Url(recipientPublicKey)
      : recipientPublicKey;
  return toBase64Url(
    await wrapEnvKey(envKey, {
      recipientPublicKey: recipient,
      senderPrivateKey: keys.privateKey,
      place,
    }),
  );
}

const STARTER_ENVIRONMENTS = ["shared", "development", "staging", "production"] as const;

export async function createProject(keys: UnlockedKeys, name: string) {
  const environmentKeys = { shared: "", development: "", staging: "", production: "" };
  const environmentIds = { ...environmentKeys };
  // Ids are chosen here so each key can be bound to its environment (ADR 0016).
  const ids = newUuidV7s(STARTER_ENVIRONMENTS.length);
  for (const [index, environmentName] of STARTER_ENVIRONMENTS.entries()) {
    const environmentId = ids[index] ?? "";
    environmentIds[environmentName] = environmentId;
    const envKey = await generateEnvKey();
    environmentKeys[environmentName] = await wrapFor(envKey, keys, keys.publicKey, {
      environmentId,
      keyVersion: 1,
    });
    await clearKey(envKey);
  }
  return call((api) => api.v1.projects.post({ name, environmentKeys, environmentIds }));
}

export async function listEnvironments(projectId: string): Promise<EnvironmentSummary[]> {
  return (await call((api) => api.v1.projects({ id: projectId }).environments.get())).items;
}

type EnvironmentRef = { id: string; name: string };

/** Fetches this user's copy of an environment key and opens it, after checking who made it. */
async function getEnvKey(
  keys: UnlockedKeys,
  projectId: string,
  environment: EnvironmentRef,
  keyVersion: number,
): Promise<Uint8Array> {
  const key = await call((api) =>
    api.v1.environments({ id: environment.id }).key.get({ query: { keyVersion } }),
  );
  return openTrustedEnvKey(keys.trust, keys, { projectId, environment, key });
}

/**
 * One version (or the latest), decrypted. An empty environment is version 0.
 * The latest is checked against what this browser saw before, so a server
 * cannot quietly hand out an older version.
 */
export async function pullEnvironment(
  keys: UnlockedKeys,
  projectId: string,
  environment: EnvironmentSummary,
  version?: number,
): Promise<{ version: number; secrets: Secrets }> {
  const query = version === undefined ? {} : { version };
  const { current } = await call((api) =>
    api.v1.environments({ id: environment.id }).secrets.get({ query }),
  );
  const isLatest = version === undefined;
  if (isLatest) {
    await checkNotRolledBack(keys.trust, environment, {
      version: current?.version ?? 0,
      keyVersion: environment.currentKeyVersion,
    });
  }
  if (current === null) {
    return { version: 0, secrets: {} };
  }
  const envKey = await getEnvKey(keys, projectId, environment, current.keyVersion);
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
  await clearKey(envKey);
  if (isLatest) {
    await rememberEnvironmentVersion(keys.trust, environment, {
      version: current.version,
      keyVersion: current.keyVersion,
    });
  }
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
  // A server must not get new secrets encrypted with an older key, or with
  // a key it made itself (ADR 0013, ADR 0016).
  await checkNotRolledBack(keys.trust, environment, { version: input.baseVersion, keyVersion });
  const envKey = await getEnvKey(keys, projectId, environment, keyVersion);
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
  await rememberEnvironmentVersion(keys.trust, environment, {
    version: created.version,
    keyVersion,
  });
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
  // The grant dialog had the admin check this fingerprint, so pin it now.
  await pinConfirmedPublicKeys(keys.trust, projectId, memberKeyOwner(member));
  const wrappedKeys: Array<{ environmentId: string; keyVersion: number; wrappedKey: string }> = [];
  for (const environment of await listEnvironments(projectId)) {
    const keyVersion = environment.currentKeyVersion;
    const envKey = await getEnvKey(keys, projectId, environment, keyVersion);
    wrappedKeys.push({
      environmentId: environment.id,
      keyVersion,
      wrappedKey: await wrapFor(envKey, keys, member.publicKey, {
        environmentId: environment.id,
        keyVersion,
      }),
    });
    await clearKey(envKey);
  }
  await call((api) => api.v1.members({ id: member.id }).grant.post({ wrappedKeys }));
}

type Rotation = {
  environmentId: string;
  newKeyVersion: number;
  wrappedKeys: Array<{ userId: string; wrappedKey: string }>;
  tokenWrappedKeys: Array<{ tokenId: string; wrappedKey: string }>;
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
): Promise<{ revokedTokens: Array<{ id: string; name: string; environmentName: string }> }> {
  if (member.status === "pending") {
    return call((api) => api.v1.members({ id: member.id }).delete({ rotations: [] }));
  }
  const staying = everyone.filter(
    (candidate) => candidate.id !== member.id && candidate.status === "active",
  );
  const activeTokens = await listActiveTokens(projectId);
  // A hacked server could list a fake member or token; new keys go only to
  // keys this browser trusts, and new ones need the admin's yes.
  await trustRecipients(keys.trust, keys, projectId, [
    ...staying.flatMap(memberKeyOwner),
    ...activeTokens.map(tokenKeyOwner),
  ]);
  const rotations: Rotation[] = [];
  for (const environment of await listEnvironments(projectId)) {
    const newKeyVersion = environment.currentKeyVersion + 1;
    const newEnvKey = await generateEnvKey();
    const wrappedKeys: Rotation["wrappedKeys"] = [];
    for (const recipient of staying) {
      if (recipient.publicKey !== null) {
        wrappedKeys.push({
          userId: recipient.userId,
          wrappedKey: await wrapFor(newEnvKey, keys, recipient.publicKey, {
            environmentId: environment.id,
            keyVersion: newKeyVersion,
          }),
        });
      }
    }
    // Service tokens for this environment get the new key too, so CI keeps working.
    const tokenWrappedKeys: Rotation["tokenWrappedKeys"] = [];
    for (const token of activeTokens.filter(
      (candidate) => candidate.environmentId === environment.id,
    )) {
      tokenWrappedKeys.push({
        tokenId: token.id,
        wrappedKey: await wrapFor(newEnvKey, keys, token.publicKey, {
          environmentId: environment.id,
          keyVersion: newKeyVersion,
        }),
      });
    }
    const latest = await pullEnvironment(keys, projectId, environment);
    const rotation: Rotation = {
      environmentId: environment.id,
      newKeyVersion,
      wrappedKeys,
      tokenWrappedKeys,
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
  // The answer lists the service tokens this member made, which were revoked with them.
  return call((api) => api.v1.members({ id: member.id }).delete({ rotations }));
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

/** Service tokens that still work (not revoked, not expired). */
export async function listActiveTokens(projectId: string) {
  const { items } = await call((api) => api.v1.projects({ id: projectId }).tokens.get());
  const now = Date.now();
  return items.filter(
    (token) =>
      token.revokedAt === null &&
      (token.expiresAt === null || new Date(token.expiresAt).getTime() > now),
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Makes a read-only token for one environment, entirely in the browser. The
 * API gets the public key, the environment key wrapped for it and a hash of
 * the token id. Returns the token text, which is shown once.
 */
export async function createServiceToken(
  keys: UnlockedKeys,
  projectId: string,
  environment: EnvironmentSummary,
  name: string,
  expiresAt?: Date,
): Promise<string> {
  const tokenId = toHex(crypto.getRandomValues(new Uint8Array(24)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokenId));
  const tokenKeys = await generateUserKeys();
  const keyVersion = environment.currentKeyVersion;
  const envKey = await getEnvKey(keys, projectId, environment, keyVersion);
  const body = {
    environmentId: environment.id,
    name,
    tokenIdHash: toHex(new Uint8Array(digest)),
    publicKey: await toBase64Url(tokenKeys.publicKey),
    wrappedKey: await wrapFor(envKey, keys, tokenKeys.publicKey, {
      environmentId: environment.id,
      keyVersion,
    }),
    ...(expiresAt === undefined ? {} : { expiresAt: expiresAt.toISOString() }),
  };
  await clearKey(envKey);
  const created = await call((api) => api.v1.projects({ id: projectId }).tokens.post(body));
  // Made here, so this is the one time its key is known to be right.
  await pinConfirmedPublicKeys(keys.trust, projectId, [
    tokenKeyOwner({ id: created.id, name, publicKey: body.publicKey }),
  ]);
  const token = `envy_${tokenId}_${await toBase64Url(tokenKeys.privateKey)}`;
  await clearKey(tokenKeys.privateKey);
  return token;
}
