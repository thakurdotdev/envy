import { describe, expect, test } from "bun:test";
import { addFormatVersion, readFormatVersion } from "./format.ts";
import { generateRecoveryKey } from "./recovery-key.ts";
import { expectCryptoError, flipBit } from "./test/expect-crypto-error.ts";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  generateUserKeys,
  getPublicKey,
} from "./user-keys.ts";

// Any 32 random bytes work as a wrapping key; a recovery key is the cheapest
// one to make (no slow password hashing).
async function makeWrappingKey(): Promise<Uint8Array> {
  return (await generateRecoveryKey()).key;
}

describe("generateUserKeys", () => {
  test("makes a matching keypair, different every time", async () => {
    const first = await generateUserKeys();
    const second = await generateUserKeys();

    expect(await getPublicKey(first.privateKey)).toEqual(first.publicKey);
    expect(second.privateKey).not.toEqual(first.privateKey);
  });
});

describe("encryptPrivateKey and decryptPrivateKey", () => {
  test("round trip", async () => {
    const { privateKey } = await generateUserKeys();
    const wrappingKey = await makeWrappingKey();

    const encrypted = await encryptPrivateKey(privateKey, wrappingKey);

    expect(await decryptPrivateKey(encrypted, wrappingKey)).toEqual(privateKey);
  });

  test("fails with the wrong key", async () => {
    const { privateKey } = await generateUserKeys();
    const encrypted = await encryptPrivateKey(privateKey, await makeWrappingKey());

    await expectCryptoError(
      decryptPrivateKey(encrypted, await makeWrappingKey()),
      "DECRYPTION_FAILED",
    );
  });

  test("fails when the nonce or the ciphertext was changed", async () => {
    const { privateKey } = await generateUserKeys();
    const wrappingKey = await makeWrappingKey();
    const encrypted = await encryptPrivateKey(privateKey, wrappingKey);
    const nonceByte = 1;
    const ciphertextByte = encrypted.length - 1;

    await expectCryptoError(
      decryptPrivateKey(flipBit(encrypted, nonceByte), wrappingKey),
      "DECRYPTION_FAILED",
    );
    await expectCryptoError(
      decryptPrivateKey(flipBit(encrypted, ciphertextByte), wrappingKey),
      "DECRYPTION_FAILED",
    );
  });

  test("refuses unknown format versions and cut-off data", async () => {
    const { privateKey } = await generateUserKeys();
    const wrappingKey = await makeWrappingKey();
    const { body } = readFormatVersion(await encryptPrivateKey(privateKey, wrappingKey));

    await expectCryptoError(
      decryptPrivateKey(addFormatVersion(0, body), wrappingKey),
      "UNSUPPORTED_FORMAT_VERSION",
    );
    await expectCryptoError(
      decryptPrivateKey(addFormatVersion(2, body), wrappingKey),
      "UNSUPPORTED_FORMAT_VERSION",
    );
    await expectCryptoError(decryptPrivateKey(new Uint8Array(0), wrappingKey), "INVALID_INPUT");
    await expectCryptoError(
      decryptPrivateKey(addFormatVersion(1, body.subarray(0, 10)), wrappingKey),
      "INVALID_INPUT",
    );
  });

  test("rejects keys of the wrong length", async () => {
    const wrappingKey = await makeWrappingKey();

    await expectCryptoError(encryptPrivateKey(new Uint8Array(31), wrappingKey), "INVALID_INPUT");
    await expectCryptoError(
      encryptPrivateKey((await generateUserKeys()).privateKey, new Uint8Array(16)),
      "INVALID_INPUT",
    );
  });
});
