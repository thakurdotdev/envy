import {
  answerKeyChallenge,
  DEFAULT_KDF_PARAMS,
  deriveMasterKey,
  encryptPrivateKey,
  fromBase64Url,
  generateRecoveryKey,
  generateSalt,
  generateUserKeys,
  toBase64Url,
} from "@envy/crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeGitHubUser } from "../../test/fake-github.ts";
import { createTestApp, readErrorCode, readField, type TestApp } from "../../test/test-app.ts";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

/** Makes key material exactly as a client does at first setup. */
async function makeKeyMaterial(keys?: { publicKey: Uint8Array; privateKey: Uint8Array }) {
  const { publicKey, privateKey } = keys ?? (await generateUserKeys());
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey("example master password", salt, DEFAULT_KDF_PARAMS);
  const recovery = await generateRecoveryKey();
  return {
    publicKey: await toBase64Url(publicKey),
    encryptedPrivateKey: await toBase64Url(await encryptPrivateKey(privateKey, masterKey)),
    recoveryEncryptedPrivateKey: await toBase64Url(
      await encryptPrivateKey(privateKey, recovery.key),
    ),
    kdfSalt: await toBase64Url(salt),
    kdfParams: DEFAULT_KDF_PARAMS,
  };
}

describe("PUT /v1/me/keys", () => {
  test("stores key material once, returns it from /v1/me, and refuses to overwrite it", async () => {
    const { accessToken } = await testApp.signInWithCli(makeGitHubUser("nia"));
    const keys = await makeKeyMaterial();

    const saved = await testApp.request("PUT", "/v1/me/keys", { accessToken, body: keys });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ keys });

    const me = await testApp.request("GET", "/v1/me", { accessToken });
    expect(me.body).toMatchObject({ keys });

    const overwrite = await testApp.request("PUT", "/v1/me/keys", {
      accessToken,
      body: await makeKeyMaterial(),
    });
    expect(overwrite.status).toBe(409);
    expect(readErrorCode(overwrite.body)).toBe("KEYS_ALREADY_SET");
  });

  test("refuses values no client could have made", async () => {
    const { accessToken } = await testApp.signInWithCli(makeGitHubUser("oli"));
    const keys = await makeKeyMaterial();
    const badBodies = [
      { ...keys, publicKey: keys.kdfSalt },
      { ...keys, encryptedPrivateKey: "not+base64url" },
      { ...keys, kdfParams: { ...keys.kdfParams, memLimitBytes: 1024 } },
      { ...keys, kdfParams: { ...keys.kdfParams, algorithm: "argon2i13" } },
      { publicKey: keys.publicKey },
    ];

    for (const body of badBodies) {
      const response = await testApp.request("PUT", "/v1/me/keys", { accessToken, body });
      expect(response.status).toBe(400);
      expect(readErrorCode(response.body)).toBe("VALIDATION_FAILED");
    }
    const me = await testApp.request("GET", "/v1/me", { accessToken });
    expect(me.body).toMatchObject({ keys: null });
  });

  test("validation errors name the field but never echo the value", async () => {
    const { accessToken } = await testApp.signInWithCli(makeGitHubUser("pat"));
    const keys = await makeKeyMaterial();

    const response = await testApp.request("PUT", "/v1/me/keys", {
      accessToken,
      body: { ...keys, kdfSalt: 12345678 },
    });

    expect(response.status).toBe(400);
    const text = JSON.stringify(response.body);
    expect(text).toContain("kdfSalt");
    expect(text).not.toContain("12345678");
    expect(text).not.toContain(keys.encryptedPrivateKey);
  });
});

describe("replacing the encrypted private key", () => {
  test("needs the private key: a stolen session alone cannot overwrite it", async () => {
    const { accessToken } = await testApp.signInWithCli(makeGitHubUser("pia"));
    const userKeys = await generateUserKeys();
    const first = await makeKeyMaterial(userKeys);
    await testApp.request("PUT", "/v1/me/keys", { accessToken, body: first });
    const next = await makeKeyMaterial(userKeys);
    const newCopy = {
      encryptedPrivateKey: next.encryptedPrivateKey,
      kdfSalt: next.kdfSalt,
      kdfParams: next.kdfParams,
    };

    const challenge = await testApp.request("POST", "/v1/me/keys/challenge", { accessToken });
    const challengeToken = readField(challenge.body, "challengeToken");
    const guessed = await testApp.request("POST", "/v1/me/keys/replace", {
      accessToken,
      body: { ...newCopy, challengeToken, challengeAnswer: await toBase64Url(new Uint8Array(32)) },
    });
    expect(guessed.status).toBe(403);
    expect(readErrorCode(guessed.body)).toBe("KEY_CHALLENGE_FAILED");

    const answer = await answerKeyChallenge(
      await fromBase64Url(readField(challenge.body, "sealedChallenge")),
      userKeys.privateKey,
    );
    const replaced = await testApp.request("POST", "/v1/me/keys/replace", {
      accessToken,
      body: { ...newCopy, challengeToken, challengeAnswer: await toBase64Url(answer) },
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body).toMatchObject({
      keys: {
        ...newCopy,
        publicKey: first.publicKey,
        recoveryEncryptedPrivateKey: first.recoveryEncryptedPrivateKey,
      },
    });

    // A token is only good for the account it was made for, and not after 5 minutes.
    const other = await testApp.signInWithCli(makeGitHubUser("quin"));
    await testApp.request("PUT", "/v1/me/keys", {
      accessToken: other.accessToken,
      body: await makeKeyMaterial(),
    });
    const borrowed = await testApp.request("POST", "/v1/me/keys/replace", {
      accessToken: other.accessToken,
      body: { ...newCopy, challengeToken, challengeAnswer: await toBase64Url(answer) },
    });
    expect(readErrorCode(borrowed.body)).toBe("KEY_CHALLENGE_FAILED");
    testApp.advanceClock(6 * 60 * 1000);
    const late = await testApp.request("POST", "/v1/me/keys/replace", {
      accessToken,
      body: { ...newCopy, challengeToken, challengeAnswer: await toBase64Url(answer) },
    });
    expect(readErrorCode(late.body)).toBe("KEY_CHALLENGE_FAILED");
  });
});
