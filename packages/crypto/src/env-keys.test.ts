import { describe, expect, test } from "bun:test";
import {
  generateEnvKey,
  isLegacyWrappedEnvKey,
  unwrapEnvKey,
  unwrapLegacyEnvKey,
  wrapEnvKey,
} from "./env-keys.ts";
import { addFormatVersion, readFormatVersion } from "./format.ts";
import { loadSodium } from "./sodium.ts";
import { expectCryptoError, flipBit } from "./test/expect-crypto-error.ts";
import { generateUserKeys } from "./user-keys.ts";

const place = { environmentId: "0193a6f0-0000-7000-8000-000000000001", keyVersion: 2 };

async function wrappedByAdminForMember() {
  const admin = await generateUserKeys();
  const member = await generateUserKeys();
  const envKey = await generateEnvKey();
  const wrapped = await wrapEnvKey(envKey, {
    recipientPublicKey: member.publicKey,
    senderPrivateKey: admin.privateKey,
    place,
  });
  return { admin, member, envKey, wrapped };
}

describe("wrapEnvKey and unwrapEnvKey", () => {
  test("the recipient gets the key back, given who sent it", async () => {
    const { admin, member, envKey, wrapped } = await wrappedByAdminForMember();

    const opened = await unwrapEnvKey(wrapped, {
      recipientPrivateKey: member.privateKey,
      senderPublicKey: admin.publicKey,
      place,
    });

    expect(opened).toEqual(envKey);
    expect(isLegacyWrappedEnvKey(wrapped)).toBe(false);
  });

  test("works for a key wrapped for yourself", async () => {
    const owner = await generateUserKeys();
    const envKey = await generateEnvKey();
    const wrapped = await wrapEnvKey(envKey, {
      recipientPublicKey: owner.publicKey,
      senderPrivateKey: owner.privateKey,
      place,
    });

    expect(
      await unwrapEnvKey(wrapped, {
        recipientPrivateKey: owner.privateKey,
        senderPublicKey: owner.publicKey,
        place,
      }),
    ).toEqual(envKey);
  });

  test("a key made with only public keys (by a server) does not open", async () => {
    const { admin, member } = await wrappedByAdminForMember();
    const server = await generateUserKeys();
    const forged = await wrapEnvKey(await generateEnvKey(), {
      recipientPublicKey: member.publicKey,
      senderPrivateKey: server.privateKey,
      place,
    });

    await expectCryptoError(
      unwrapEnvKey(forged, {
        recipientPrivateKey: member.privateKey,
        senderPublicKey: admin.publicKey,
        place,
      }),
      "DECRYPTION_FAILED",
    );
  });

  test("a key moved to another environment or key version does not open", async () => {
    const { admin, member, wrapped } = await wrappedByAdminForMember();
    const open = (where: typeof place) =>
      unwrapEnvKey(wrapped, {
        recipientPrivateKey: member.privateKey,
        senderPublicKey: admin.publicKey,
        place: where,
      });

    await expectCryptoError(open({ ...place, keyVersion: 3 }), "DECRYPTION_FAILED");
    await expectCryptoError(
      open({ ...place, environmentId: "0193a6f0-0000-7000-8000-000000000002" }),
      "DECRYPTION_FAILED",
    );
  });

  test("nobody else can open it, and a key sent back the other way does not count", async () => {
    const { admin, member, wrapped } = await wrappedByAdminForMember();
    const outsider = await generateUserKeys();

    await expectCryptoError(
      unwrapEnvKey(wrapped, {
        recipientPrivateKey: outsider.privateKey,
        senderPublicKey: admin.publicKey,
        place,
      }),
      "DECRYPTION_FAILED",
    );
    // The key exchange gives both sides the same secret, so the direction is
    // bound too: the admin cannot open it as if the member had sent it.
    await expectCryptoError(
      unwrapEnvKey(wrapped, {
        recipientPrivateKey: admin.privateKey,
        senderPublicKey: member.publicKey,
        place,
      }),
      "DECRYPTION_FAILED",
    );
  });

  test("fails when the wrapped key was changed", async () => {
    const { admin, member, wrapped } = await wrappedByAdminForMember();
    for (const position of [5, wrapped.length - 1]) {
      await expectCryptoError(
        unwrapEnvKey(flipBit(wrapped, position), {
          recipientPrivateKey: member.privateKey,
          senderPublicKey: admin.publicKey,
          place,
        }),
        "DECRYPTION_FAILED",
      );
    }
  });

  test("refuses unknown format versions and bad input", async () => {
    const { admin, member, wrapped } = await wrappedByAdminForMember();
    const { body } = readFormatVersion(wrapped);

    await expectCryptoError(
      unwrapEnvKey(addFormatVersion(9, body), {
        recipientPrivateKey: member.privateKey,
        senderPublicKey: admin.publicKey,
        place,
      }),
      "UNSUPPORTED_FORMAT_VERSION",
    );
    await expectCryptoError(
      wrapEnvKey(new Uint8Array(16), {
        recipientPublicKey: member.publicKey,
        senderPrivateKey: admin.privateKey,
        place,
      }),
      "INVALID_INPUT",
    );
    await expectCryptoError(
      wrapEnvKey(await generateEnvKey(), {
        recipientPublicKey: new Uint8Array(31),
        senderPrivateKey: admin.privateKey,
        place,
      }),
      "INVALID_INPUT",
    );
    await expectCryptoError(
      wrapEnvKey(await generateEnvKey(), {
        recipientPublicKey: member.publicKey,
        senderPrivateKey: admin.privateKey,
        place: { ...place, keyVersion: 0 },
      }),
      "INVALID_INPUT",
    );
  });
});

describe("unwrapLegacyEnvKey", () => {
  test("opens a format 1 sealed box, which anyone could have made", async () => {
    const sodium = await loadSodium();
    const member = await generateUserKeys();
    const envKey = await generateEnvKey();
    const legacy = addFormatVersion(1, sodium.crypto_box_seal(envKey, member.publicKey));

    expect(isLegacyWrappedEnvKey(legacy)).toBe(true);
    expect(await unwrapLegacyEnvKey(legacy, member.privateKey)).toEqual(envKey);
    await expectCryptoError(
      unwrapLegacyEnvKey(legacy, (await generateUserKeys()).privateKey),
      "DECRYPTION_FAILED",
    );
  });

  test("refuses format 2, which must be opened with its sender", async () => {
    const { member, wrapped } = await wrappedByAdminForMember();
    await expectCryptoError(
      unwrapLegacyEnvKey(wrapped, member.privateKey),
      "UNSUPPORTED_FORMAT_VERSION",
    );
  });
});
