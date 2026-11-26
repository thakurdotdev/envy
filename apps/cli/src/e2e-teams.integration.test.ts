import { makeGitHubUser } from "@envy/api/testing";
import { parseDotenv } from "@envy/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startE2eHarness, type E2eHarness } from "./test/e2e-harness.ts";

let harness: E2eHarness;

beforeAll(async () => {
  harness = await startE2eHarness();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

describe("envy teams, end to end", () => {
  test("invite, accept, grant, history, rollback and removal with key rotation", async () => {
    const { workspace, testApp } = harness;
    const ownerHome = join(workspace, "owner");
    const bobHome = join(workspace, "bob");
    const ownerProject = join(workspace, "owner-project");
    const bobProject = join(workspace, "bob-project");
    await Promise.all([mkdir(ownerHome), mkdir(bobHome), mkdir(ownerProject), mkdir(bobProject)]);
    await writeFile(join(ownerProject, ".env"), "TOKEN=one\n");
    const asOwner = (args: string[]) =>
      harness.runEnvy(args, { cwd: ownerProject, home: ownerHome });
    const asBob = (args: string[]) => harness.runEnvy(args, { cwd: bobProject, home: bobHome });

    testApp.github.autoApproveDevices(makeGitHubUser("owner"));
    expect((await asOwner(["login"])).exitCode).toBe(0);
    expect((await asOwner(["init", "--create", "Team E2E", "--yes"])).exitCode).toBe(0);

    const invite = await asOwner(["members", "invite", "bob@example.invalid", "--role", "member"]);
    expect(invite.exitCode).toBe(0);
    const link = invite.stdout.trim();
    expect(link).toContain("/invite?token=");

    testApp.github.autoApproveDevices(makeGitHubUser("bob"));
    expect((await asBob(["login"])).exitCode).toBe(0);
    const accepted = await asBob(["accept", link]);
    expect(accepted.stderr).toContain("Joined Team E2E as member");
    const bobFingerprint = /Your key fingerprint: ([A-Z2-7 ]{19})/.exec(accepted.stderr)?.[1];
    expect(bobFingerprint).toBeString();

    await cp(join(ownerProject, ".envy.json"), join(bobProject, ".envy.json"));
    const beforeGrant = await asBob(["pull"]);
    expect(beforeGrant.exitCode).toBe(1);

    const list = await asOwner(["members", "ls"]);
    expect(list.stdout).toContain("@bob");
    expect(list.stdout).toContain("waiting for keys");
    const grant = await asOwner(["members", "grant", "--yes"]);
    expect(grant.stderr).toContain(bobFingerprint ?? "missing");
    expect(grant.stderr).toContain("@bob can now pull every environment");

    expect((await asBob(["pull"])).exitCode).toBe(0);
    expect(parseDotenv(await readFile(join(bobProject, ".env"), "utf8"))).toEqual({ TOKEN: "one" });

    expect((await asOwner(["set", "TOKEN=two"])).exitCode).toBe(0);
    const history = await asOwner(["history"]);
    expect(history.stdout).toContain("v2");
    expect(history.stdout).toContain("Imported from .env");
    const rollback = await asOwner(["rollback", "1", "--yes"]);
    expect(rollback.stderr).toContain("saved as version 3");
    expect((await asOwner(["get", "TOKEN"])).stdout).toBe("one\n");

    const removed = await asOwner(["members", "rm", "bob", "--yes"]);
    expect(removed.stderr).toContain("changed the key of every environment they could read");
    expect(removed.stderr).toContain("Change the real credentials");

    const bobAfter = await asBob(["pull"]);
    expect(bobAfter.exitCode).toBe(1);
    const ownerAfter = await asOwner(["pull"]);
    expect(ownerAfter.exitCode).toBe(0);
    expect((await asOwner(["get", "TOKEN"])).stdout).toBe("one\n");
  }, 120_000);
});
