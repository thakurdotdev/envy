import { makeGitHubUser } from "@envy/api/testing";
import {
  DEFAULT_KDF_PARAMS,
  generateEnvKey,
  generateUserKeys,
  toBase64Url,
  wrapEnvKey,
} from "@envy/crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startE2eHarness, type E2eHarness } from "./test/e2e-harness.ts";

// The server is not trusted (docs/threat-model.md). These tests change the
// database directly, the way a hacked server could, and check that the CLI
// refuses to use what it is handed (ADR 0016).

let harness: E2eHarness;

beforeAll(async () => {
  harness = await startE2eHarness();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

describe("a hacked server, end to end", () => {
  test("cannot slip in an environment key of its own making", async () => {
    const { workspace, testApp } = harness;
    const home = join(workspace, "owner");
    const project = join(workspace, "project");
    await Promise.all([mkdir(home), mkdir(project)]);
    await writeFile(join(project, ".env"), "TOKEN=one\n");
    const asOwner = (args: string[]) => harness.runEnvy(args, { cwd: project, home });

    const ownerOnGitHub = makeGitHubUser("owner");
    testApp.github.autoApproveDevices(ownerOnGitHub);
    expect((await asOwner(["login"])).exitCode).toBe(0);
    expect((await asOwner(["init", "--create", "Hostile E2E", "--yes"])).exitCode).toBe(0);
    expect((await asOwner(["pull"])).exitCode).toBe(0);

    // The server invents a member, makes a new key version with its own
    // keypair and wraps it for the owner, as that member.
    const { repositories } = testApp;
    const owner = await repositories.users.upsertFromGitHub(ownerOnGitHub);
    const mallory = await repositories.users.upsertFromGitHub(makeGitHubUser("mallory"));
    const serverKeys = await generateUserKeys();
    await repositories.users.setKeysIfEmpty(mallory.id, {
      publicKey: await toBase64Url(serverKeys.publicKey),
      encryptedPrivateKey: "x",
      recoveryEncryptedPrivateKey: "x",
      kdfSalt: "x",
      kdfParams: DEFAULT_KDF_PARAMS,
    });
    const link: unknown = JSON.parse(await readFile(join(project, ".envy.json"), "utf8"));
    const projectId =
      typeof link === "object" && link !== null && "projectId" in link
        ? String(link.projectId)
        : "";
    const environments = await repositories.environments.listForProject(projectId);
    const development = environments.find((environment) => environment.name === "development");
    if (development === undefined || owner.publicKey === null) {
      throw new Error("The project was not set up.");
    }
    await repositories.environments.addWrappedKeys([
      {
        environmentId: development.id,
        keyVersion: 2,
        recipientType: "user",
        recipientId: owner.id,
        wrappedKey: await toBase64Url(
          await wrapEnvKey(await generateEnvKey(), {
            recipientPublicKey: Buffer.from(owner.publicKey, "base64url"),
            senderPrivateKey: serverKeys.privateKey,
            place: { environmentId: development.id, keyVersion: 2 },
          }),
        ),
        createdBy: mallory.id,
      },
    ]);
    expect(await repositories.environments.advanceKeyVersion(development.id, 1)).toBe(true);

    const push = await asOwner(["set", "TOKEN=two"]);

    expect(push.exitCode).toBe(1);
    expect(push.stderr).toContain("@mallory");
    expect(push.stderr).toContain("This needs an answer");
    // Nothing was encrypted with the server's key: version 1 is still the latest.
    expect(await repositories.secrets.latestVersionNumber(development.id)).toBe(1);
  }, 120_000);
});
