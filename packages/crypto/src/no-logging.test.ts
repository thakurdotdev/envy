import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as crypto from "./index.ts";

// The package must never print anything: a log line could leak a key.
describe("no logging", () => {
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  let spies: Array<ReturnType<typeof spyOn>> = [];

  beforeEach(() => {
    spies = methods.map((method) => spyOn(console, method).mockImplementation(() => {}));
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
  });

  test("a full flow, including failures, writes nothing to the console", async () => {
    const member = await crypto.generateUserKeys();
    const envKey = await crypto.generateEnvKey();
    const place = { projectId: "p", environmentId: "e", version: 1, keyVersion: 1 };
    const keyPlace = { environmentId: "e", keyVersion: 1 };
    const wrapped = await crypto.wrapEnvKey(envKey, {
      recipientPublicKey: member.publicKey,
      senderPrivateKey: member.privateKey,
      place: keyPlace,
    });
    const encrypted = await crypto.encryptSecrets({ A: "b" }, envKey, place);
    await crypto.decryptSecrets(
      encrypted,
      await crypto.unwrapEnvKey(wrapped, {
        recipientPrivateKey: member.privateKey,
        senderPublicKey: member.publicKey,
        place: keyPlace,
      }),
      place,
    );
    await crypto.decryptSecrets(encrypted, await crypto.generateEnvKey(), place).catch(() => {});
    await crypto.parseRecoveryKey("wrong").catch(() => {});
    await crypto.clearKey(envKey);

    expect(envKey.every((byte) => byte === 0)).toBe(true);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
