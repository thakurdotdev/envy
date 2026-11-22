import { describe, expect, test } from "bun:test";
import { DEFAULT_KDF_PARAMS, deriveMasterKey, generateSalt, type KdfParams } from "./master-key.ts";
import { expectCryptoError } from "./test/expect-crypto-error.ts";

describe("deriveMasterKey", () => {
  test("gives the same key for the same password and salt, and a different key otherwise", async () => {
    const salt = await generateSalt();
    const otherSalt = await generateSalt();

    const first = await deriveMasterKey("correct horse", salt, DEFAULT_KDF_PARAMS);
    const again = await deriveMasterKey("correct horse", salt, DEFAULT_KDF_PARAMS);
    const otherPassword = await deriveMasterKey("correct horsf", salt, DEFAULT_KDF_PARAMS);
    const otherSaltKey = await deriveMasterKey("correct horse", otherSalt, DEFAULT_KDF_PARAMS);

    expect(first).toHaveLength(32);
    expect(again).toEqual(first);
    expect(otherPassword).not.toEqual(first);
    expect(otherSaltKey).not.toEqual(first);
  });

  test("treats the same password typed in different Unicode forms as equal", async () => {
    const salt = await generateSalt();
    const composed = "café";
    const decomposed = "café";

    const fromComposed = await deriveMasterKey(composed, salt, DEFAULT_KDF_PARAMS);
    const fromDecomposed = await deriveMasterKey(decomposed, salt, DEFAULT_KDF_PARAMS);

    expect(fromDecomposed).toEqual(fromComposed);
  });

  test("refuses settings below the safe minimum, which a hacked server could send", async () => {
    const salt = await generateSalt();
    const weakSettings: KdfParams[] = [
      { ...DEFAULT_KDF_PARAMS, opsLimit: 1 },
      { ...DEFAULT_KDF_PARAMS, memLimitBytes: 8 * 1024 * 1024 },
      { ...DEFAULT_KDF_PARAMS, memLimitBytes: 64 * 1024 * 1024 * 1024 },
      { ...DEFAULT_KDF_PARAMS, opsLimit: 2.5 },
      { ...DEFAULT_KDF_PARAMS, ...({ algorithm: "argon2i13" } as object) },
    ];

    for (const params of weakSettings) {
      await expectCryptoError(deriveMasterKey("password", salt, params), "WEAK_KDF_PARAMS");
    }
  });

  test("rejects a salt of the wrong length and an empty password", async () => {
    await expectCryptoError(
      deriveMasterKey("password", new Uint8Array(8), DEFAULT_KDF_PARAMS),
      "INVALID_INPUT",
    );
    await expectCryptoError(
      deriveMasterKey("", await generateSalt(), DEFAULT_KDF_PARAMS),
      "INVALID_INPUT",
    );
  });
});
