import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkApiUrl } from "./settings.ts";
import { checkEnvironmentVersion, checkPublicKeys } from "./trust.ts";

/** The error message a promise rejects with, or "did not fail". */
async function failureOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "did not fail",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

const bob = (publicKey: string) => ({
  kind: "user" as const,
  id: "0193a6f0-0000-7000-8000-000000000002",
  label: "@bob",
  publicKey,
});

describe("trust", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "envy-trust-"));
    process.env["ENVY_CONFIG_DIR"] = folder;
  });

  afterEach(async () => {
    delete process.env["ENVY_CONFIG_DIR"];
    await rm(folder, { recursive: true, force: true });
  });

  test("remembers a public key the first time and refuses a different one later", async () => {
    await checkPublicKeys([bob("key-a")]);
    await checkPublicKeys([bob("key-a")]);

    expect(await failureOf(checkPublicKeys([bob("key-b")]))).toContain(
      "different public key for @bob",
    );
  });

  test("a token and a user with the same id are pinned apart", async () => {
    await checkPublicKeys([bob("key-a")]);

    await checkPublicKeys([{ ...bob("key-b"), kind: "token", label: "the token" }]);
  });

  test("refuses an older secrets version or key version than one already seen", async () => {
    const production = { id: "0193a6f0-0000-7000-8000-000000000003", name: "production" };
    await checkEnvironmentVersion(production, { version: 5, keyVersion: 2 });
    await checkEnvironmentVersion(production, { version: 6, keyVersion: 2 });

    const olderVersion = checkEnvironmentVersion(production, { version: 5, keyVersion: 2 });
    expect(await failureOf(olderVersion)).toContain("version 5, which is older");
    const olderKey = checkEnvironmentVersion(production, { version: 6, keyVersion: 1 });
    expect(await failureOf(olderKey)).toContain("key version 1, which is older");
    const emptied = checkEnvironmentVersion(production, { version: 0, keyVersion: 2 });
    expect(await failureOf(emptied)).toContain("older");
  });
});

describe("checkApiUrl", () => {
  test("allows https anywhere and plain http only for this machine", () => {
    expect(checkApiUrl("https://api.example.com/")).toBe("https://api.example.com");
    expect(checkApiUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(checkApiUrl("http://127.0.0.1:4000")).toBe("http://127.0.0.1:4000");
    for (const url of ["http://api.example.com", "ftp://x", "not a url"]) {
      expect(() => checkApiUrl(url)).toThrow("not a safe https:// address");
    }
  });
});
