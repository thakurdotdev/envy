import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkApiUrl } from "./settings.ts";
import {
  checkListedPublicKeys,
  checkNotRolledBack,
  pinConfirmedPublicKeys,
  rememberEnvironmentVersion,
} from "./trust.ts";

const projectId = "0193a6f0-0000-7000-8000-000000000001";

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

describe("trust.json", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "envy-trust-"));
    process.env["ENVY_CONFIG_DIR"] = folder;
  });

  afterEach(async () => {
    delete process.env["ENVY_CONFIG_DIR"];
    await rm(folder, { recursive: true, force: true });
  });

  test("remembers a public key and refuses a different one later, with a way out", async () => {
    await checkListedPublicKeys(projectId, [bob("key-a")]);
    await checkListedPublicKeys(projectId, [bob("key-a")]);

    const failure = await failureOf(checkListedPublicKeys(projectId, [bob("key-b")]));
    expect(failure).toContain("different public key for @bob");
    const saved: unknown = JSON.parse(await readFile(join(folder, "trust.json"), "utf8"));
    expect(saved).toMatchObject({ knownProjects: [projectId] });
  });

  test("a token and a user with the same id are pinned apart", async () => {
    await pinConfirmedPublicKeys(projectId, [bob("key-a")]);

    await pinConfirmedPublicKeys(projectId, [
      { ...bob("key-b"), kind: "token", label: "the token" },
    ]);
  });

  test("refuses an older secrets version or key version than one already seen", async () => {
    const production = { id: "0193a6f0-0000-7000-8000-000000000003", name: "production" };
    await rememberEnvironmentVersion(production, { version: 6, keyVersion: 2 });

    const olderVersion = checkNotRolledBack(production, { version: 5, keyVersion: 2 });
    expect(await failureOf(olderVersion)).toContain("version 5, which is older");
    const olderKey = checkNotRolledBack(production, { version: 6, keyVersion: 1 });
    expect(await failureOf(olderKey)).toContain("key version 1, which is older");
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
