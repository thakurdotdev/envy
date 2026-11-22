import { describe, expect, test } from "bun:test";
import { fingerprint } from "./fingerprint.ts";
import { expectCryptoError, flipBit } from "./test/expect-crypto-error.ts";
import { generateUserKeys } from "./user-keys.ts";

describe("fingerprint", () => {
  test("is short, stable and changes when the key changes even by one bit", async () => {
    const { publicKey } = await generateUserKeys();

    const code = await fingerprint(publicKey);

    expect(code).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{4}){3}$/);
    expect(await fingerprint(publicKey)).toBe(code);
    expect(await fingerprint(flipBit(publicKey, 0))).not.toBe(code);
  });

  test("rejects a key of the wrong length", async () => {
    await expectCryptoError(fingerprint(new Uint8Array(16)), "INVALID_INPUT");
  });
});
