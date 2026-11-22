import { makeGitHubUser } from "@envy/api/testing";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startE2eHarness, type E2eHarness } from "./test/e2e-harness.ts";

let harness: E2eHarness;

beforeAll(async () => {
  harness = await startE2eHarness();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

describe("service tokens and polish, end to end", () => {
  test("a CI job reads one environment with only ENVY_TOKEN, and can do nothing else", async () => {
    const { workspace, testApp } = harness;
    const ownerHome = join(workspace, "owner");
    const bobHome = join(workspace, "bob");
    const ciHome = join(workspace, "ci-machine");
    const ownerProject = join(workspace, "owner-project");
    const bobProject = join(workspace, "bob-project");
    const ciCheckout = join(workspace, "ci-checkout");
    for (const folder of [ownerHome, bobHome, ciHome, ownerProject, bobProject, ciCheckout]) {
      await mkdir(folder);
    }
    const asOwner = (args: string[]) =>
      harness.runEnvy(args, { cwd: ownerProject, home: ownerHome });
    const asBob = (args: string[]) => harness.runEnvy(args, { cwd: bobProject, home: bobHome });

    testApp.github.autoApproveDevices(makeGitHubUser("owner"));
    expect((await asOwner(["login"])).exitCode).toBe(0);
    expect((await asOwner(["init", "--create", "CI App"])).exitCode).toBe(0);
    expect((await asOwner(["set", "DATABASE_URL=postgres://ci-db"])).exitCode).toBe(0);
    expect((await asOwner(["set", "STAGING_ONLY=yes", "--env", "staging"])).exitCode).toBe(0);

    const created = await asOwner([
      "token",
      "create",
      "--env",
      "development",
      "--name",
      "github-actions",
    ]);
    expect(created.exitCode).toBe(0);
    const token = created.stdout.trim();
    expect(token).toMatch(/^envy_[0-9a-f]{48}_[A-Za-z0-9_-]{43}$/);

    // The CI machine: nothing but the token. No login, no .envy.json.
    const asCi = (args: string[]) =>
      harness.runEnvy(args, { cwd: ciCheckout, home: ciHome, env: { ENVY_TOKEN: token } });
    const ciRun = await asCi([
      "run",
      "--",
      process.execPath,
      "-e",
      "console.log(process.env.DATABASE_URL)",
    ]);
    expect(ciRun.stdout.trim()).toBe("postgres://ci-db");
    expect(ciRun.exitCode).toBe(0);

    await writeFile(join(ciCheckout, ".env"), "DATABASE_URL=postgres://hacked\n");
    const ciPush = await asCi(["push", "--yes"]);
    expect(ciPush.exitCode).toBe(1);
    expect(ciPush.stderr).toContain("Service tokens can only read");
    const ciSet = await asCi(["set", "EVIL=1"]);
    expect(ciSet.exitCode).toBe(1);
    const ciOther = await asCi(["pull", "--env", "staging"]);
    expect(ciOther.exitCode).toBe(1);
    expect(ciOther.stderr).toContain("only reads development");

    // Removing a member rotates every key; the token gets the new key too.
    testApp.github.autoApproveDevices(makeGitHubUser("bob"));
    const invite = await asOwner(["members", "invite", "bob@example.invalid"]);
    expect((await asBob(["login"])).exitCode).toBe(0);
    expect((await asBob(["accept", invite.stdout.trim()])).exitCode).toBe(0);
    expect((await asOwner(["members", "grant", "--yes"])).exitCode).toBe(0);
    expect((await asOwner(["members", "rm", "bob", "--yes"])).exitCode).toBe(0);
    const afterRotation = await asCi([
      "run",
      "--",
      process.execPath,
      "-e",
      "console.log(process.env.DATABASE_URL)",
    ]);
    expect(afterRotation.stdout.trim()).toBe("postgres://ci-db");

    const list = await asOwner(["token", "ls", "--json"]);
    expect(JSON.parse(list.stdout)).toMatchObject([
      { name: "github-actions", environmentName: "development" },
    ]);
    expect((await asOwner(["token", "revoke", "github-actions"])).exitCode).toBe(0);
    const revoked = await asCi(["run", "--", process.execPath, "-e", "1"]);
    expect(revoked.exitCode).toBe(2);
  }, 120_000);

  test("doctor, completion, --json, .env.example warnings and NO_COLOR", async () => {
    const { workspace } = harness;
    const home = join(workspace, "owner");
    const project = join(workspace, "owner-project");
    const asOwner = (args: string[]) => harness.runEnvy(args, { cwd: project, home });

    await writeFile(join(project, ".env.example"), "DATABASE_URL=\nSTRIPE_KEY=\n");
    const run = await asOwner(["run", "--", process.execPath, "-e", "1"]);
    expect(run.stderr).toContain("development is missing STRIPE_KEY (listed in .env.example)");
    expect(run.stderr).not.toContain("\u001B[");

    const doctor = await asOwner(["doctor", "--json"]);
    const checks: unknown = JSON.parse(doctor.stdout);
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: "server", status: "ok" }),
        expect.objectContaining({ check: "sign-in", status: "ok" }),
        expect.objectContaining({ check: "project link", status: "ok" }),
        expect.objectContaining({ check: "access", status: "ok" }),
        // Checked against what envy stores for development, not the local file.
        expect.objectContaining({
          check: "missing keys",
          status: "warning",
          message: expect.stringContaining("development does not set STRIPE_KEY"),
        }),
      ]),
    );

    const environments = await asOwner(["env", "ls", "--json"]);
    expect(JSON.parse(environments.stdout)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "production", isProtected: true })]),
    );
    const get = await asOwner(["get", "DATABASE_URL", "--json"]);
    expect(JSON.parse(get.stdout)).toEqual({ DATABASE_URL: "postgres://ci-db" });

    const bash = await asOwner(["completion", "bash"]);
    expect(bash.stdout).toContain("complete -F _envy_complete envy");
    expect(bash.stdout).toContain("members)");
    const help = await asOwner([]);
    expect(help.stdout).toContain("Usage: envy");
  }, 60_000);
});
