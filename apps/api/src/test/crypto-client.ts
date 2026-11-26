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
import { newUuidV7s } from "@envy/shared";
import { createHash, randomBytes } from "node:crypto";
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

/** Wraps an environment key from `sender` for `recipientPublicKey`, as a client does. */
export async function wrapAsClient(
  envKey: Uint8Array,
  sender: TestUser,
  recipientPublicKey: Uint8Array,
  place: { environmentId: string; keyVersion: number },
): Promise<string> {
  return toBase64Url(
    await wrapEnvKey(envKey, {
      recipientPublicKey,
      senderPrivateKey: sender.keys.privateKey,
      place,
    }),
  );
}

/**
 * The body that creates a project: four environment ids chosen here, and a
 * new key for each, wrapped for the owner and bound to that id.
 */
export async function makeProjectBody(owner: TestUser, name: string) {
  const names = ["shared", "development", "staging", "production"] as const;
  const ids = newUuidV7s(names.length);
  const environmentKeys: Record<string, string> = {};
  const environmentIds: Record<string, string> = {};
  for (const [index, environmentName] of names.entries()) {
    const environmentId = ids[index] ?? "";
    environmentIds[environmentName] = environmentId;
    environmentKeys[environmentName] = await wrapAsClient(
      await generateEnvKey(),
      owner,
      owner.keys.publicKey,
      { environmentId, keyVersion: 1 },
    );
  }
  return { name, environmentKeys, environmentIds };
}

export async function createProjectAsClient(testApp: TestApp, owner: TestUser, name: string) {
  const created = await testApp.request("POST", "/v1/projects", {
    accessToken: owner.accessToken,
    body: await makeProjectBody(owner, name),
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
export async function fetchEnvKey(
  testApp: TestApp,
  user: TestUser,
  environmentId: string,
  keyVersion?: number,
) {
  const query = keyVersion === undefined ? "" : `?keyVersion=${keyVersion}`;
  const response = await testApp.request("GET", `/v1/environments/${environmentId}/key${query}`, {
    accessToken: user.accessToken,
  });
  const wrapped = await fromBase64Url(readField(response.body, "wrappedKey"));
  const sender = readObject(response.body, "sender");
  return unwrapEnvKey(wrapped, {
    recipientPrivateKey: user.keys.privateKey,
    senderPublicKey: await fromBase64Url(readField(sender, "publicKey")),
    place: { environmentId, keyVersion: readNumber(response.body, "keyVersion") },
  });
}

export async function pushSecretsAsClient(
  testApp: TestApp,
  user: TestUser,
  place: { projectId: string; environmentId: string },
  secrets: Secrets,
  baseVersion: number,
) {
  return testApp.request("POST", `/v1/environments/${place.environmentId}/secrets`, {
    accessToken: user.accessToken,
    body: await encryptPushAsClient(testApp, user, place, secrets, baseVersion),
  });
}

/** The body of one push: the secrets encrypted for `baseVersion + 1` with the current key. */
export async function encryptPushAsClient(
  testApp: TestApp,
  user: TestUser,
  place: { projectId: string; environmentId: string },
  secrets: Secrets,
  baseVersion: number,
) {
  const keyResponse = await testApp.request("GET", `/v1/environments/${place.environmentId}/key`, {
    accessToken: user.accessToken,
  });
  const keyVersion = readNumber(keyResponse.body, "keyVersion");
  const envKey = await fetchEnvKey(testApp, user, place.environmentId);
  const encrypted = await encryptSecrets(secrets, envKey, {
    ...place,
    version: baseVersion + 1,
    keyVersion,
  });
  return {
    baseVersion,
    keyVersion,
    ciphertext: await toBase64Url(encrypted.ciphertext),
    nonce: await toBase64Url(encrypted.nonce),
  };
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
  const envKey = await fetchEnvKey(
    testApp,
    user,
    place.environmentId,
    readNumber(current, "keyVersion"),
  );
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

/** Lists members, failing the test if the call fails. */
export async function listMembers(testApp: TestApp, user: TestUser, projectId: string) {
  const response = await testApp.request("GET", `/v1/projects/${projectId}/members`, {
    accessToken: user.accessToken,
  });
  return readItems(response.body).map((item) => ({
    id: readField(item, "id"),
    userId: readField(item, "userId"),
    githubLogin: readField(item, "githubLogin"),
    status: readField(item, "status"),
    role: readField(item, "role"),
    publicKey: readField(item, "publicKey"),
  }));
}

type EnvironmentInfo = {
  id: string;
  appId: string | null;
  name: string;
  currentKeyVersion: number;
  latestVersion: number;
};

export async function listEnvironmentInfo(
  testApp: TestApp,
  user: TestUser,
  projectId: string,
): Promise<EnvironmentInfo[]> {
  // App environments too: grants and rotations must cover them (ADR 0018).
  const response = await testApp.request(
    "GET",
    `/v1/projects/${projectId}/environments?apps=true`,
    {
      accessToken: user.accessToken,
    },
  );
  return readItems(response.body).map((item) => ({
    id: readField(item, "id"),
    appId: readObject(item, "appId") === null ? null : readField(item, "appId"),
    name: readField(item, "name"),
    currentKeyVersion: readNumber(item, "currentKeyVersion"),
    latestVersion: readNumber(item, "latestVersion"),
  }));
}

/** The admin's client wraps each environment key for the pending member and sends them. */
export async function grantAsClient(
  testApp: TestApp,
  admin: TestUser,
  projectId: string,
  member: { id: string; publicKey: string },
) {
  const memberPublicKey = await fromBase64Url(member.publicKey);
  const wrappedKeys = [];
  for (const environment of await listEnvironmentInfo(testApp, admin, projectId)) {
    const envKey = await fetchEnvKey(testApp, admin, environment.id);
    wrappedKeys.push({
      environmentId: environment.id,
      keyVersion: environment.currentKeyVersion,
      wrappedKey: await wrapAsClient(envKey, admin, memberPublicKey, {
        environmentId: environment.id,
        keyVersion: environment.currentKeyVersion,
      }),
    });
  }
  return testApp.request("POST", `/v1/members/${member.id}/grant`, {
    accessToken: admin.accessToken,
    body: { wrappedKeys },
  });
}

/**
 * The admin's client makes a new key for every environment, wraps it for
 * everyone who stays, re-encrypts the latest secrets, and removes the member.
 */
export async function removeAsClient(
  testApp: TestApp,
  admin: TestUser,
  projectId: string,
  memberId: string,
  tokenWrappedKeys: Record<string, Array<{ tokenId: string; wrappedKey: string }>> = {},
) {
  const remaining = (await listMembers(testApp, admin, projectId)).filter(
    (member) => member.id !== memberId && member.status === "active",
  );
  const rotations = [];
  for (const environment of await listEnvironmentInfo(testApp, admin, projectId)) {
    const newEnvKey = await generateEnvKey();
    const newKeyVersion = environment.currentKeyVersion + 1;
    const wrappedKeys = [];
    for (const member of remaining) {
      wrappedKeys.push({
        userId: member.userId,
        wrappedKey: await wrapAsClient(newEnvKey, admin, await fromBase64Url(member.publicKey), {
          environmentId: environment.id,
          keyVersion: newKeyVersion,
        }),
      });
    }
    const rotation: Record<string, unknown> = {
      environmentId: environment.id,
      newKeyVersion,
      wrappedKeys,
      baseVersion: environment.latestVersion,
      ...(tokenWrappedKeys[environment.id] === undefined
        ? {}
        : { tokenWrappedKeys: tokenWrappedKeys[environment.id] }),
    };
    if (environment.latestVersion > 0) {
      const latest = await pullSecretsAsClient(testApp, admin, {
        projectId,
        environmentId: environment.id,
      });
      const encrypted = await encryptSecrets(latest, newEnvKey, {
        projectId,
        environmentId: environment.id,
        version: environment.latestVersion + 1,
        keyVersion: newKeyVersion,
      });
      rotation["ciphertext"] = await toBase64Url(encrypted.ciphertext);
      rotation["nonce"] = await toBase64Url(encrypted.nonce);
    }
    rotations.push(rotation);
  }
  return testApp.request("DELETE", `/v1/members/${memberId}`, {
    accessToken: admin.accessToken,
    body: { rotations },
  });
}

/** Makes a service token the way the CLI does, and returns its bearer header value. */
export async function createTokenAsClient(
  testApp: TestApp,
  admin: TestUser,
  place: { projectId: string; environmentId: string },
  name: string,
  /** Environments under this one the token should read too (ADR 0018). */
  layerEnvironmentIds?: string[],
) {
  const tokenId = randomBytes(24).toString("hex");
  const tokenKeys = await generateUserKeys();
  const keyResponse = await testApp.request("GET", `/v1/environments/${place.environmentId}/key`, {
    accessToken: admin.accessToken,
  });
  const keyVersion = readNumber(keyResponse.body, "keyVersion");
  const envKey = await fetchEnvKey(testApp, admin, place.environmentId, keyVersion);
  const response = await testApp.request("POST", `/v1/projects/${place.projectId}/tokens`, {
    accessToken: admin.accessToken,
    body: {
      environmentId: place.environmentId,
      name,
      tokenIdHash: createHash("sha256").update(tokenId).digest("hex"),
      publicKey: await toBase64Url(tokenKeys.publicKey),
      wrappedKey: await wrapAsClient(envKey, admin, tokenKeys.publicKey, {
        environmentId: place.environmentId,
        keyVersion,
      }),
      ...(layerEnvironmentIds === undefined
        ? {}
        : {
            layerWrappedKeys: await wrapLayersForToken(
              testApp,
              admin,
              tokenKeys.publicKey,
              layerEnvironmentIds,
            ),
          }),
    },
  });
  return {
    status: response.status,
    id: response.status === 201 ? readField(response.body, "id") : "",
    bearer: `Bearer envy_${tokenId}`,
    keys: tokenKeys,
  };
}

async function wrapLayersForToken(
  testApp: TestApp,
  admin: TestUser,
  tokenPublicKey: Uint8Array,
  environmentIds: string[],
) {
  const wrapped = [];
  for (const environmentId of environmentIds) {
    const keyResponse = await testApp.request("GET", `/v1/environments/${environmentId}/key`, {
      accessToken: admin.accessToken,
    });
    const keyVersion = readNumber(keyResponse.body, "keyVersion");
    const envKey = await fetchEnvKey(testApp, admin, environmentId, keyVersion);
    wrapped.push({
      environmentId,
      wrappedKey: await wrapAsClient(envKey, admin, tokenPublicKey, { environmentId, keyVersion }),
    });
  }
  return wrapped;
}
