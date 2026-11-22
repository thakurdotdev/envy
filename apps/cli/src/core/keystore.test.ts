import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileKeystore } from "./keystore.ts";

describe("file keystore", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "envy-keystore-"));
    process.env["ENVY_CONFIG_DIR"] = folder;
  });

  afterEach(async () => {
    delete process.env["ENVY_CONFIG_DIR"];
    await rm(folder, { recursive: true, force: true });
  });

  test("keeps sessions per server in a 0600 file and never writes the private key", async () => {
    const keystore = createFileKeystore();
    const credentials = {
      apiUrl: "http://api.test",
      userId: "user-1",
      accessToken: "access",
      accessTokenExpiresAt: 1,
      refreshToken: "refresh",
      privateKey: "PRIVATE-KEY-MUST-NOT-BE-SAVED",
    };

    await keystore.save(credentials);

    const path = join(folder, "credentials.json");
    expect(await readFile(path, "utf8")).not.toContain("PRIVATE-KEY-MUST-NOT-BE-SAVED");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const { privateKey: _, ...withoutPrivateKey } = credentials;
    expect(await keystore.load("http://api.test")).toEqual(withoutPrivateKey);
    expect(await keystore.load("http://other.test")).toBeUndefined();

    await keystore.clear("http://api.test");
    expect(await keystore.load("http://api.test")).toBeUndefined();
  });
});
