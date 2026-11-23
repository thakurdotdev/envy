import { describe, expect, test } from "bun:test";
import { generateEnvKey, generateUserKeys, toBase64Url, wrapEnvKey } from "@envy/crypto";
import {
  assertNotRolledBack,
  checkListedKeys,
  emptyTrustState,
  openWrappedEnvKey,
  rememberVersion,
  trustKeyOwners,
  TrustError,
  type ConfirmNewKeys,
  type KeyOwner,
  type TrustState,
  type TrustStore,
} from "./trust.ts";

function memoryStore(): TrustStore & { state: TrustState } {
  const store = {
    state: emptyTrustState(),
    resetHint: "start over.",
    read: async () => structuredClone(store.state),
    write: async (state: TrustState) => {
      store.state = structuredClone(state);
    },
  };
  return store;
}

const fingerprintOf = async (publicKey: string) => `fp-${publicKey.slice(0, 4)}`;
const refuse: ConfirmNewKeys = async () => false;
const accept: ConfirmNewKeys = async () => true;

function owner(id: string, publicKey: string): KeyOwner {
  return { kind: "user", id, label: `@${id}`, publicKey };
}

async function problemOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "none";
  } catch (error) {
    return error instanceof TrustError ? error.problem : String(error);
  }
}

describe("trustKeyOwners", () => {
  test("trusts every key on first use of a project, then asks about new ones", async () => {
    const store = memoryStore();
    const base = { store, projectId: "p1", ownPublicKey: "me", fingerprintOf };

    await trustKeyOwners({ ...base, owners: [owner("ada", "A")], confirm: refuse });
    expect(store.state.publicKeys["user:ada"]).toBe("A");

    // A member added later (maybe by a hacked server) needs a yes.
    const withNew = [owner("ada", "A"), owner("eve", "E")];
    expect(await problemOf(trustKeyOwners({ ...base, owners: withNew, confirm: refuse }))).toBe(
      "not-confirmed",
    );
    expect(store.state.publicKeys["user:eve"]).toBeUndefined();

    let asked: string[] = [];
    await trustKeyOwners({
      ...base,
      owners: withNew,
      confirm: async (owners) => {
        asked = owners.map((item) => `${item.label} ${item.fingerprint}`);
        return true;
      },
    });
    expect(asked).toEqual(["@eve fp-E"]);
    expect(store.state.publicKeys["user:eve"]).toBe("E");
  });

  test("always refuses a key that changed, even when asked to confirm", async () => {
    const store = memoryStore();
    const base = { store, projectId: "p1", ownPublicKey: "me", fingerprintOf, confirm: accept };
    await trustKeyOwners({ ...base, owners: [owner("ada", "A")] });

    expect(await problemOf(trustKeyOwners({ ...base, owners: [owner("ada", "X")] }))).toBe(
      "key-changed",
    );
  });

  test("your own key needs no confirmation", async () => {
    const store = memoryStore();
    const base = { store, projectId: "p1", ownPublicKey: "me", fingerprintOf, confirm: refuse };
    await trustKeyOwners({ ...base, owners: [owner("ada", "A")] });

    await trustKeyOwners({ ...base, owners: [owner("myself", "me")] });
  });
});

describe("checkListedKeys", () => {
  test("only remembers keys on first use, so a listing cannot sneak a member in", async () => {
    const store = memoryStore();
    await checkListedKeys(store, "p1", [owner("ada", "A")]);
    await checkListedKeys(store, "p1", [owner("ada", "A"), owner("eve", "E")]);

    expect(store.state.publicKeys["user:ada"]).toBe("A");
    expect(store.state.publicKeys["user:eve"]).toBeUndefined();
    expect(await problemOf(checkListedKeys(store, "p1", [owner("ada", "X")]))).toBe("key-changed");
  });
});

describe("rememberVersion and assertNotRolledBack", () => {
  test("keeps the newest and refuses older ones", async () => {
    const store = memoryStore();
    const environment = { id: "e1", name: "production" };
    await rememberVersion(store, environment, { version: 5, keyVersion: 2 });

    expect(
      await problemOf(assertNotRolledBack(store, environment, { version: 4, keyVersion: 2 })),
    ).toBe("rolled-back");
    expect(
      await problemOf(assertNotRolledBack(store, environment, { version: 6, keyVersion: 1 })),
    ).toBe("rolled-back");
    await assertNotRolledBack(store, environment, { version: 6, keyVersion: 3 });
    await rememberVersion(store, environment, { version: 6, keyVersion: 3 });
    await rememberVersion(store, environment, { version: 0, keyVersion: 0 });
    expect(store.state.environments["e1"]).toEqual({ version: 6, keyVersion: 3 });
  });
});

// Format byte 1 and junk: enough to see which way the trust check goes.
async function legacyFor(keyVersion: number) {
  return {
    keyVersion,
    wrappedKey: await toBase64Url(new Uint8Array([1, ...new Uint8Array(80)])),
    sender: { userId: "x", githubLogin: "x", publicKey: "x" },
  };
}

describe("openWrappedEnvKey", () => {
  const environment = { id: "0193a6f0-0000-7000-8000-000000000001", name: "production" };

  async function setUp() {
    const admin = await generateUserKeys();
    const member = await generateUserKeys();
    const adminPublicKey = await toBase64Url(admin.publicKey);
    const memberKeys = {
      privateKey: member.privateKey,
      publicKey: await toBase64Url(member.publicKey),
    };
    const envKey = await generateEnvKey();
    const wrapFrom = async (senderPrivateKey: Uint8Array, keyVersion: number) =>
      toBase64Url(
        await wrapEnvKey(envKey, {
          recipientPublicKey: member.publicKey,
          senderPrivateKey,
          place: { environmentId: environment.id, keyVersion },
        }),
      );
    return { admin, adminPublicKey, memberKeys, envKey, wrapFrom };
  }

  test("opens a key from a trusted sender", async () => {
    const { admin, adminPublicKey, memberKeys, envKey, wrapFrom } = await setUp();
    const store = memoryStore();

    const opened = await openWrappedEnvKey({
      store,
      projectId: "p1",
      environment,
      key: {
        keyVersion: 1,
        wrappedKey: await wrapFrom(admin.privateKey, 1),
        sender: { userId: "admin", githubLogin: "admin", publicKey: adminPublicKey },
      },
      keys: memberKeys,
      confirm: refuse,
      fingerprintOf,
    });

    expect(opened).toEqual(envKey);
  });

  test("refuses a key the server made under the name of a trusted member", async () => {
    const { admin, adminPublicKey, memberKeys, wrapFrom } = await setUp();
    const store = memoryStore();
    const base = { store, projectId: "p1", environment, keys: memberKeys, fingerprintOf };
    const sender = { userId: "admin", githubLogin: "admin", publicKey: adminPublicKey };
    await openWrappedEnvKey({
      ...base,
      confirm: refuse,
      key: { keyVersion: 1, wrappedKey: await wrapFrom(admin.privateKey, 1), sender },
    });
    const server = await generateUserKeys();

    // Signed with the server's own key but claimed to be from the admin.
    const forged = await wrapFrom(server.privateKey, 2);
    expect(
      await openWrappedEnvKey({
        ...base,
        confirm: refuse,
        key: { keyVersion: 2, wrappedKey: forged, sender },
      }).catch((error: unknown) => (error instanceof Error ? error.name : "")),
    ).toBe("CryptoError");

    // Signed with the server's own key, from a "member" it made up.
    const fakeSender = {
      userId: "eve",
      githubLogin: "eve",
      publicKey: await toBase64Url(server.publicKey),
    };
    expect(
      await problemOf(
        openWrappedEnvKey({
          ...base,
          confirm: refuse,
          key: { keyVersion: 2, wrappedKey: forged, sender: fakeSender },
        }),
      ),
    ).toBe("not-confirmed");
  });

  test("accepts an old-format key only for a key version already seen", async () => {
    const { memberKeys } = await setUp();
    const store = memoryStore();
    await rememberVersion(store, environment, { version: 3, keyVersion: 2 });
    const base = {
      store,
      projectId: "p1",
      environment,
      keys: memberKeys,
      confirm: refuse,
      fingerprintOf,
    };

    // Allowed through to the decryption (which fails on the junk).
    expect(await problemOf(openWrappedEnvKey({ ...base, key: await legacyFor(2) }))).toContain(
      "could not be opened",
    );
    expect(await problemOf(openWrappedEnvKey({ ...base, key: await legacyFor(3) }))).toBe(
      "old-format-key",
    );
  });
});
