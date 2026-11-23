import { describe, expect, test } from "bun:test";
import { answerKeyChallenge, makeKeyChallenge } from "./key-challenge.ts";
import { expectCryptoError } from "./test/expect-crypto-error.ts";
import { generateUserKeys } from "./user-keys.ts";

describe("key challenges", () => {
  test("only the private key's holder can answer", async () => {
    const owner = await generateUserKeys();
    const challenge = await makeKeyChallenge(owner.publicKey);

    expect(await answerKeyChallenge(challenge.sealed, owner.privateKey)).toEqual(challenge.answer);
    await expectCryptoError(
      answerKeyChallenge(challenge.sealed, (await generateUserKeys()).privateKey),
      "DECRYPTION_FAILED",
    );
  });

  test("rejects keys of the wrong length", async () => {
    await expectCryptoError(makeKeyChallenge(new Uint8Array(5)), "INVALID_INPUT");
  });
});
