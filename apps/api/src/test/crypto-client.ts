import {
  DEFAULT_KDF_PARAMS,
  decryptSecrets,
  deriveMasterKey,
  encryptPrivateKey,
  encryptSecrets,
  fromBase64Url,
  generateEnvKey,
  generateRecoveryKey,
  generateSalt,
  generateUserKeys,
  toBase64Url,
  unwrapEnvKey,
  wrapEnvKey,
  type Secrets,
  type UserKeys,
} from "@envy/crypto";
import { makeGitHubUser } from "./fake-github.ts";
import { readField, type TestApp } from "./test-app.ts";

// Plays the part of a real client (CLI or web): all encryption happens here,
// and only ciphertext and wrapped keys are sent to the API.

export type TestUser = {
  accessToken: string;
  userId: string;
  keys: UserKeys;
};

export async function signUpWithKeys(testApp: TestApp, login: string): Promise<TestUser> {
  const session = await testApp.signInWithCli(makeGitHubUser(login));
  const keys = await generateUserKeys();
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey(`${login} master password`, salt, DEFAULT_KDF_PARAMS);
  const recovery = await generateRecoveryKey();
  const response = await testApp.request("PUT", "/v1/me/keys", {
    accessToken: session.accessToken,
    body: {
      publicKey: await toBase64Url(keys.publicKey),
      encryptedPrivateKey: await toBase64Url(await encryptPrivateKey(keys.privateKey, masterKey)),
      recoveryEncryptedPrivateKey: await toBase64Url(
        await encryptPrivateKey(keys.privateKey, recovery.key),
      ),
      kdfSalt: await toBase64Url(salt),
      kdfParams: DEFAULT_KDF_PARAMS,
    },
  });
  if (response.status !== 200) {
    throw new Error(`Key setup failed with status ${response.status}.`);
  }
  return { accessToken: session.accessToken, userId: session.userId, keys };
}

/** Makes four environment keys and wraps each for the owner, as a client does. */
export async function makeStarterEnvironmentKeys(owner: TestUser): Promise<Record<string, string>> {
  const environmentKeys: Record<string, string> = {};
  for (const environmentName of ["shared", "development", "staging", "production"]) {
    const envKey = await generateEnvKey();
    environmentKeys[environmentName] = await toBase64Url(
      await wrapEnvKey(envKey, owner.keys.publicKey),
    );
  }
  return environmentKeys;
}

export async function createProjectAsClient(testApp: TestApp, owner: TestUser, name: string) {
  const created = await testApp.request("POST", "/v1/projects", {
    accessToken: owner.accessToken,
    body: { name, environmentKeys: await makeStarterEnvironmentKeys(owner) },
  });
  const projectId = readField(created.body, "id");
  const listed = await testApp.request("GET", `/v1/projects/${projectId}/environments`, {
    accessToken: owner.accessToken,
  });
  const environments = readItems(listed.body);
  const environmentIds: Record<string, string> = {};
  for (const environment of environments) {
    environmentIds[readField(environment, "name")] = readField(environment, "id");
  }
  return { projectId, environmentIds, createdStatus: created.status, environments };
}

/** Fetches and unwraps the caller's environment key. */
export async function fetchEnvKey(testApp: TestApp, user: TestUser, environmentId: string) {
  const response = await testApp.request("GET", `/v1/environments/${environmentId}/key`, {
    accessToken: user.accessToken,
  });
  const wrapped = await fromBase64Url(readField(response.body, "wrappedKey"));
  return unwrapEnvKey(wrapped, user.keys.privateKey);
}

export async function pushSecretsAsClient(
  testApp: TestApp,
  user: TestUser,
  place: { projectId: string; environmentId: string },
  secrets: Secrets,
  baseVersion: number,
) {
  const envKey = await fetchEnvKey(testApp, user, place.environmentId);
  const encrypted = await encryptSecrets(secrets, envKey, {
    ...place,
    version: baseVersion + 1,
    keyVersion: 1,
  });
  return testApp.request("POST", `/v1/environments/${place.environmentId}/secrets`, {
    accessToken: user.accessToken,
    body: {
      baseVersion,
      keyVersion: 1,
      ciphertext: await toBase64Url(encrypted.ciphertext),
      nonce: await toBase64Url(encrypted.nonce),
    },
  });
}

export async function pullSecretsAsClient(
  testApp: TestApp,
  user: TestUser,
  place: { projectId: string; environmentId: string },
  version?: number,
): Promise<Secrets> {
  const query = version === undefined ? "" : `?version=${version}`;
  const response = await testApp.request(
    "GET",
    `/v1/environments/${place.environmentId}/secrets${query}`,
    {
      accessToken: user.accessToken,
    },
  );
  const current = readObject(response.body, "current");
  const envKey = await fetchEnvKey(testApp, user, place.environmentId);
  return decryptSecrets(
    {
      ciphertext: await fromBase64Url(readField(current, "ciphertext")),
      nonce: await fromBase64Url(readField(current, "nonce")),
    },
    envKey,
    {
      ...place,
      version: readNumber(current, "version"),
      keyVersion: readNumber(current, "keyVersion"),
    },
  );
}

export function readItems(body: unknown): unknown[] {
  const items = readObject(body, "items");
  if (!Array.isArray(items)) {
    throw new Error('The response has no "items" list.');
  }
  return items;
}

function readObject(body: unknown, name: string): unknown {
  if (typeof body === "object" && body !== null && name in body) {
    return Object.getOwnPropertyDescriptor(body, name)?.value;
  }
  throw new Error(`The response has no field "${name}".`);
}

export function readNumber(body: unknown, name: string): number {
  const value = readObject(body, name);
  if (typeof value !== "number") {
    throw new Error(`The field "${name}" is not a number.`);
  }
  return value;
}
