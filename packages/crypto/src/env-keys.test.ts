import { describe, expect, test } from "bun:test";
import { generateEnvKey, unwrapEnvKey, wrapEnvKey } from "./env-keys.ts";
import { addFormatVersion, readFormatVersion } from "./format.ts";
import { expectCryptoError, flipBit } from "./test/expect-crypto-error.ts";
import { generateUserKeys } from "./user-keys.ts";

describe("wrapEnvKey and unwrapEnvKey", () => {
  test("the recipient gets the environment key back", async () => {
    const member = await generateUserKeys();
    const envKey = await generateEnvKey();

    const wrapped = await wrapEnvKey(envKey, member.publicKey);

    expect(await unwrapEnvKey(wrapped, member.privateKey)).toEqual(envKey);
  });

  test("nobody else can open it", async () => {
    const member = await generateUserKeys();
    const outsider = await generateUserKeys();
    const wrapped = await wrapEnvKey(await generateEnvKey(), member.publicKey);

    await expectCryptoError(unwrapEnvKey(wrapped, outsider.privateKey), "DECRYPTION_FAILED");
  });

  test("fails when the wrapped key was changed", async () => {
    const member = await generateUserKeys();
    const wrapped = await wrapEnvKey(await generateEnvKey(), member.publicKey);

    await expectCryptoError(
      unwrapEnvKey(flipBit(wrapped, wrapped.length - 1), member.privateKey),
      "DECRYPTION_FAILED",
    );
    await expectCryptoError(
      unwrapEnvKey(flipBit(wrapped, 5), member.privateKey),
      "DECRYPTION_FAILED",
    );
  });

  test("refuses unknown format versions", async () => {
    const member = await generateUserKeys();
    const { body } = readFormatVersion(await wrapEnvKey(await generateEnvKey(), member.publicKey));

    await expectCryptoError(
      unwrapEnvKey(addFormatVersion(9, body), member.privateKey),
      "UNSUPPORTED_FORMAT_VERSION",
    );
  });

  test("rejects keys of the wrong length", async () => {
    const member = await generateUserKeys();

    await expectCryptoError(wrapEnvKey(new Uint8Array(16), member.publicKey), "INVALID_INPUT");
    await expectCryptoError(
      wrapEnvKey(await generateEnvKey(), new Uint8Array(31)),
      "INVALID_INPUT",
    );
    await expectCryptoError(
      unwrapEnvKey(await wrapEnvKey(await generateEnvKey(), member.publicKey), new Uint8Array(5)),
      "INVALID_INPUT",
    );
  });
});
