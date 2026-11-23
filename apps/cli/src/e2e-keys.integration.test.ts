import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { makeGitHubUser } from "@envy/api/testing";
import { startE2eHarness, type E2eHarness } from "./test/e2e-harness.ts";

let harness: E2eHarness;

beforeAll(async () => {
  harness = await startE2eHarness();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

const RECOVERY_KEY_PATTERN = /[A-Z2-7]{5}(?:-[A-Z2-7]{1,5}){10}/;

describe("master password and recovery key, end to end", () => {
  test("change the password, then forget it and get back in with the recovery key", async () => {
    const { workspace, testApp } = harness;
    const home = join(workspace, "home");
    const project = join(workspace, "project");
    await Promise.all([mkdir(home), mkdir(project)]);
    const envy = (args: string[], env: Record<string, string> = {}) =>
      harness.runEnvy(args, { cwd: project, home, env });

    testApp.github.autoApproveDevices(makeGitHubUser("keys"));
    const login = await envy(["login"]);
    const firstRecoveryKey = RECOVERY_KEY_PATTERN.exec(login.stderr)?.[0] ?? "";
    expect(firstRecoveryKey).not.toBe("");
    expect((await envy(["init", "--create", "Keys E2E", "--yes"])).exitCode).toBe(0);
    expect((await envy(["set", "TOKEN=one"])).exitCode).toBe(0);

    const newPassword = "a brand new master password";
    const changed = await envy(["password"], { ENVY_NEW_MASTER_PASSWORD: newPassword });
    expect(changed.stderr).toContain("Changed your master password");
    expect(changed.exitCode).toBe(0);

    // The file keystore never caches the private key, so every command unlocks.
    const withOld = await envy(["get", "TOKEN"]);
    expect(withOld.exitCode).not.toBe(0);
    expect(withOld.stderr).toContain("envy recover");
    expect((await envy(["get", "TOKEN"], { ENVY_MASTER_PASSWORD: newPassword })).stdout).toBe(
      "one\n",
    );

    // Forgot it: the recovery key opens the account and is replaced.
    const finalPassword = "the password after recovery";
    const recovered = await envy(["recover"], {
      ENVY_RECOVERY_KEY: firstRecoveryKey,
      ENVY_NEW_MASTER_PASSWORD: finalPassword,
    });
    expect(recovered.exitCode).toBe(0);
    const secondRecoveryKey = RECOVERY_KEY_PATTERN.exec(recovered.stderr)?.[0] ?? "";
    expect(secondRecoveryKey).not.toBe("");
    expect(secondRecoveryKey).not.toBe(firstRecoveryKey);
    expect((await envy(["get", "TOKEN"], { ENVY_MASTER_PASSWORD: finalPassword })).stdout).toBe(
      "one\n",
    );

    const reused = await envy(["recover"], {
      ENVY_RECOVERY_KEY: firstRecoveryKey,
      ENVY_NEW_MASTER_PASSWORD: "yet another password",
    });
    expect(reused.exitCode).not.toBe(0);
    expect(reused.stderr).toContain("does not open this account");
  }, 120_000);
});
