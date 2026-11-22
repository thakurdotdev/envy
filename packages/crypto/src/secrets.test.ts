import { describe, expect, test } from "bun:test";
import { generateEnvKey } from "./env-keys.ts";
import { addFormatVersion, readFormatVersion } from "./format.ts";
import { decryptSecrets, encryptSecrets, type SecretsPlace } from "./secrets.ts";
import { expectCryptoError, flipBit } from "./test/expect-crypto-error.ts";

const place: SecretsPlace = {
  projectId: "0193a6f0-0000-7000-8000-000000000001",
  environmentId: "0193a6f0-0000-7000-8000-000000000002",
  version: 4,
  keyVersion: 2,
};

const secrets = {
  DATABASE_URL: "postgres://example.invalid/app",
  MULTILINE: "line one\nline two",
  UNICODE: "żółw 🐢",
  EMPTY: "",
};

describe("encryptSecrets and decryptSecrets", () => {
  test("round trip", async () => {
    const envKey = await generateEnvKey();

    const encrypted = await encryptSecrets(secrets, envKey, place);

    expect(encrypted.nonce).toHaveLength(24);
    expect(await decryptSecrets(encrypted, envKey, place)).toEqual(secrets);
  });

  test("an empty environment round trips", async () => {
    const envKey = await generateEnvKey();

    const encrypted = await encryptSecrets({}, envKey, place);

    expect(await decryptSecrets(encrypted, envKey, place)).toEqual({});
  });

  test("uses a fresh nonce every time", async () => {
    const envKey = await generateEnvKey();

    const first = await encryptSecrets(secrets, envKey, place);
    const second = await encryptSecrets(secrets, envKey, place);

    expect(second.nonce).not.toEqual(first.nonce);
    expect(second.ciphertext).not.toEqual(first.ciphertext);
  });

  test("fails with the wrong key", async () => {
    const encrypted = await encryptSecrets(secrets, await generateEnvKey(), place);

    await expectCryptoError(
      decryptSecrets(encrypted, await generateEnvKey(), place),
      "DECRYPTION_FAILED",
    );
  });

  test("fails when the blob is read as belonging to another place (swap or replay)", async () => {
    const envKey = await generateEnvKey();
    const encrypted = await encryptSecrets(secrets, envKey, place);
    const otherPlaces: SecretsPlace[] = [
      { ...place, projectId: "0193a6f0-0000-7000-8000-000000000009" },
      { ...place, environmentId: "0193a6f0-0000-7000-8000-000000000009" },
      { ...place, version: 5 },
      { ...place, keyVersion: 1 },
    ];

    for (const otherPlace of otherPlaces) {
      await expectCryptoError(decryptSecrets(encrypted, envKey, otherPlace), "DECRYPTION_FAILED");
    }
  });

  test("fails when the ciphertext or the nonce was changed", async () => {
    const envKey = await generateEnvKey();
    const encrypted = await encryptSecrets(secrets, envKey, place);
    const lastByte = encrypted.ciphertext.length - 1;

    await expectCryptoError(
      decryptSecrets({ ...encrypted, ciphertext: flipBit(encrypted.ciphertext, 1) }, envKey, place),
      "DECRYPTION_FAILED",
    );
    await expectCryptoError(
      decryptSecrets(
        { ...encrypted, ciphertext: flipBit(encrypted.ciphertext, lastByte) },
        envKey,
        place,
      ),
      "DECRYPTION_FAILED",
    );
    await expectCryptoError(
      decryptSecrets({ ...encrypted, nonce: flipBit(encrypted.nonce, 0) }, envKey, place),
      "DECRYPTION_FAILED",
    );
    await expectCryptoError(
      decryptSecrets({ ...encrypted, nonce: encrypted.nonce.subarray(1) }, envKey, place),
      "INVALID_INPUT",
    );
  });

  test("refuses unknown format versions", async () => {
    const envKey = await generateEnvKey();
    const encrypted = await encryptSecrets(secrets, envKey, place);
    const { body } = readFormatVersion(encrypted.ciphertext);

    await expectCryptoError(
      decryptSecrets({ ...encrypted, ciphertext: addFormatVersion(2, body) }, envKey, place),
      "UNSUPPORTED_FORMAT_VERSION",
    );
    await expectCryptoError(
      decryptSecrets({ ...encrypted, ciphertext: new Uint8Array(0) }, envKey, place),
      "INVALID_INPUT",
    );
  });

  test("rejects a place that could be confused with another one", async () => {
    const envKey = await generateEnvKey();
    const badPlaces: SecretsPlace[] = [
      { ...place, projectId: "" },
      { ...place, projectId: "a|b" },
      { ...place, version: -1 },
      { ...place, keyVersion: 1.5 },
    ];

    for (const badPlace of badPlaces) {
      await expectCryptoError(encryptSecrets(secrets, envKey, badPlace), "INVALID_INPUT");
    }
  });

  test("rejects values that are not strings", async () => {
    const envKey = await generateEnvKey();
    // Data from a file or the network is not always what its type claims.
    const notSecrets: Record<string, string> = JSON.parse('{ "PORT": 3000 }');

    await expectCryptoError(encryptSecrets(notSecrets, envKey, place), "INVALID_INPUT");
  });
});
