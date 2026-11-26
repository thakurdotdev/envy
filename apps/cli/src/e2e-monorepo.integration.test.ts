import { makeGitHubUser } from "@envy/api/testing";
import { parseDotenv } from "@envy/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startE2eHarness, type E2eHarness } from "./test/e2e-harness.ts";

let harness: E2eHarness;

beforeAll(async () => {
  harness = await startE2eHarness();
}, 120_000);

afterAll(async () => {
  await harness.close();
});

async function readEnv(path: string): Promise<Record<string, string>> {
  return parseDotenv(await readFile(path, "utf8"));
}

const PRINT_VARIABLES =
  "console.log([process.env.ORG, process.env.TEAM, process.env.PORT].join(' '))";

describe("a monorepo, end to end (ADR 0018)", () => {
  test("init finds the apps; pull, push and run work from the root and from each app", async () => {
    const { workspace, testApp } = harness;
    const home = join(workspace, "home");
    const repo = join(workspace, "repo");
    const api = join(repo, "apps/api");
    const web = join(repo, "apps/web");
    const ciCheckout = join(workspace, "ci");
    for (const folder of [home, api, web, ciCheckout]) {
      await mkdir(folder, { recursive: true });
    }
    await writeFile(join(repo, "package.json"), JSON.stringify({ workspaces: ["apps/*"] }));
    await writeFile(join(repo, ".env"), "TEAM=platform\n");
    await writeFile(join(api, ".env"), "PORT=4000\nDATABASE_URL=postgres://api\n");
    await writeFile(join(web, ".env"), "PORT=3000\n");
    const envy = (args: string[], cwd = repo, env: Record<string, string> = {}) =>
      harness.runEnvy(args, { cwd, home, env });

    testApp.github.autoApproveDevices(makeGitHubUser("mono"));
    expect((await envy(["login"])).exitCode).toBe(0);
    const init = await envy(["init", "--create", "Mono", "--yes"]);
    expect(init.exitCode).toBe(0);
    expect(init.stderr).toContain("Added the app api (apps/api)");
    expect(init.stderr).toContain("1 from .env → development");
    expect(init.stderr).toContain("2 from apps/api/.env → api/development");
    expect(init.stderr).toContain("1 from apps/web/.env → web/development");
    const link: unknown = JSON.parse(await readFile(join(repo, ".envy.json"), "utf8"));
    expect(link).toMatchObject({ apps: { api: { path: "apps/api" }, web: { path: "apps/web" } } });
    expect((await envy(["set", "ORG=acme", "--env", "shared"])).exitCode).toBe(0);

    // At the root, pull writes every app's file, each with its layers merged.
    for (const path of [join(repo, ".env"), join(api, ".env"), join(web, ".env")]) {
      await rm(path);
    }
    const pull = await envy(["pull"]);
    expect(pull.exitCode).toBe(0);
    expect(pull.stderr).toContain("from web/development → apps/web/.env");
    expect(await readEnv(join(web, ".env"))).toEqual({
      ORG: "acme",
      TEAM: "platform",
      PORT: "3000",
    });
    expect(await readEnv(join(api, ".env"))).toMatchObject({ DATABASE_URL: "postgres://api" });

    // Inside an app folder, run uses that app: shared, root and app values.
    const run = await envy(["run", "--", process.execPath, "-e", PRINT_VARIABLES], web);
    expect(run.stdout.trim()).toBe("acme platform 3000");

    // A push from the app folder sends only the app's own keys.
    await writeFile(join(web, ".env"), "ORG=acme\nTEAM=platform\nPORT=3001\n");
    const webPush = await envy(["push", "--yes"], web);
    expect(webPush.stderr).toContain("Pushed version 2 of web/development (+0 ~1 −0)");

    // At the root, one push covers the root and the apps, and the root
    // value the web file still holds is not copied into web.
    await writeFile(join(repo, ".env"), "ORG=acme\nTEAM=infra\n");
    await writeFile(
      join(api, ".env"),
      "ORG=acme\nTEAM=platform\nPORT=4001\nDATABASE_URL=postgres://api\n",
    );
    const rootPush = await envy(["push", "--yes"]);
    expect(rootPush.exitCode).toBe(0);
    expect(rootPush.stderr).toContain("Pushed version 2 of development");
    expect(rootPush.stderr).toContain("Pushed version 2 of api/development");
    expect(rootPush.stderr).not.toContain("web/development");
    await envy(["pull"], web);
    expect(await readEnv(join(web, ".env"))).toMatchObject({ TEAM: "infra", PORT: "3001" });

    // A token for the web app gives CI the same values as envy run.
    const created = await envy(["token", "create", "--name", "web-ci"], web);
    expect(created.exitCode).toBe(0);
    const ciRun = await envy(["run", "--", process.execPath, "-e", PRINT_VARIABLES], ciCheckout, {
      ENVY_TOKEN: created.stdout.trim(),
    });
    expect(ciRun.stdout.trim()).toBe("acme infra 3001");

    const addStage = await envy(["env", "add", "preview"]);
    expect(addStage.stderr).toContain("for the root and 2 apps");
    const listed = await envy(["apps", "ls"]);
    expect(listed.stdout).toContain("apps/web/.env");

    const removed = await envy(["apps", "rm", "api", "--yes"]);
    expect(removed.exitCode).toBe(0);
    const afterRemoval: unknown = JSON.parse(await readFile(join(repo, ".envy.json"), "utf8"));
    expect(afterRemoval).not.toMatchObject({ apps: { api: {} } });
    expect((await envy(["pull"])).exitCode).toBe(0);

    // Deleting asks for nothing more with --yes, and can be undone for 30 days.
    const deleted = await envy(["projects", "rm", "Mono", "--yes"]);
    expect(deleted.stderr).toContain("Deleted Mono. You can restore it until");
    expect((await envy(["pull"])).exitCode).toBe(1);
    const listedDeleted = await envy(["projects", "ls", "--deleted"]);
    expect(listedDeleted.stdout).toContain("mono");
    const restored = await envy(["projects", "restore", "mono"]);
    expect(restored.stderr).toContain("Restored Mono");
    expect((await envy(["pull"])).exitCode).toBe(0);
  }, 180_000);
});
