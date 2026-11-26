import { makeGitHubUser } from "@envy/api/testing";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { startE2eHarness, type E2eHarness } from "./test/e2e-harness.ts";

let harness: E2eHarness;

beforeAll(async () => {
  harness = await startE2eHarness();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

describe("access per environment, end to end (ADR 0019)", () => {
  test("a contractor gets development only, then staging, then loses it again", async () => {
    const { workspace, testApp } = harness;
    const ownerHome = join(workspace, "owner");
    const contractorHome = join(workspace, "contractor");
    const ownerProject = join(workspace, "owner-project");
    const contractorProject = join(workspace, "contractor-project");
    for (const folder of [ownerHome, contractorHome, ownerProject, contractorProject]) {
      await mkdir(folder);
    }
    const asOwner = (args: string[]) =>
      harness.runEnvy(args, { cwd: ownerProject, home: ownerHome });
    const asContractor = (args: string[]) =>
      harness.runEnvy(args, { cwd: contractorProject, home: contractorHome });

    testApp.github.autoApproveDevices(makeGitHubUser("owner"));
    expect((await asOwner(["login"])).exitCode).toBe(0);
    expect((await asOwner(["init", "--create", "Agency"])).exitCode).toBe(0);
    expect((await asOwner(["set", "DEV_KEY=dev"])).exitCode).toBe(0);
    expect((await asOwner(["set", "STAGING_KEY=stage", "--env", "staging"])).exitCode).toBe(0);

    testApp.github.autoApproveDevices(makeGitHubUser("contractor"));
    const invite = await asOwner(["members", "invite", "contractor@example.invalid"]);
    expect((await asContractor(["login"])).exitCode).toBe(0);
    expect((await asContractor(["accept", invite.stdout.trim()])).exitCode).toBe(0);
    const granted = await asOwner(["members", "grant", "--access", "development", "--yes"]);
    expect(granted.stderr).toContain("can now pull shared, development");
    const listed = await asOwner(["members", "ls"]);
    expect(listed.stdout).toMatch(/@contractor\s+member\s+development/);

    // The contractor's clone of the repo has the committed .envy.json.
    await cp(join(ownerProject, ".envy.json"), join(contractorProject, ".envy.json"));
    const contractorPull = await asContractor(["get", "DEV_KEY"]);
    expect(contractorPull.stdout).toBe("dev\n");
    const refused = await asContractor(["get", "STAGING_KEY", "--env", "staging"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('no environment called "staging"');

    const widened = await asOwner(["members", "access", "contractor", "development,staging"]);
    expect(widened.stderr).toContain("Gave them the keys of 1 more environment");
    expect((await asContractor(["get", "STAGING_KEY", "--env", "staging"])).stdout).toBe("stage\n");

    const narrowed = await asOwner(["members", "access", "contractor", "development"]);
    expect(narrowed.stderr).toContain("Changed the key of 1 environment they lost");
    expect((await asContractor(["get", "STAGING_KEY", "--env", "staging"])).exitCode).toBe(1);
    // The owner still reads staging under its new key.
    expect((await asOwner(["get", "STAGING_KEY", "--env", "staging"])).stdout).toBe("stage\n");

    const promoted = await asOwner(["members", "role", "contractor", "admin"]);
    expect(promoted.exitCode).toBe(1);
    expect(promoted.stderr).toContain("access to every environment first");
    expect((await asOwner(["members", "rm", "contractor", "--yes"])).exitCode).toBe(0);
  }, 180_000);
});
