import { createTestApp, makeGitHubUser, type TestApp } from "@envy/api/testing";
import { parseDotenv } from "@envy/shared";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Builds the real single-file binary and drives it against a real API
// server (with a fake GitHub), exactly as a user would from a terminal,
// except that nobody is there to answer prompts.

const MASTER_PASSWORD = "e2e master password";
let testApp: TestApp;
let apiUrl: string;
let workspace: string;
let binary: string;

type RunResult = { exitCode: number; stdout: string; stderr: string };

async function runEnvy(
  args: string[],
  options: { cwd: string; home: string; env?: Record<string, string> },
): Promise<RunResult> {
  const child = Bun.spawn([binary, ...args], {
    cwd: options.cwd,
    env: {
      PATH: process.env["PATH"] ?? "",
      HOME: options.home,
      ENVY_CONFIG_DIR: join(options.home, ".config", "envy"),
      ENVY_API_URL: apiUrl,
      ENVY_KEYSTORE: "file",
      ENVY_MASTER_PASSWORD: MASTER_PASSWORD,
      ENVY_NO_BROWSER: "1",
      NO_COLOR: "1",
      ...options.env,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function readEnv(path: string): Promise<Record<string, string>> {
  return parseDotenv(await readFile(path, "utf8"));
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "envy-e2e-"));
  binary = join(workspace, "envy");
  const build = Bun.spawnSync(
    ["bun", "build", join(import.meta.dir, "index.ts"), "--compile", "--outfile", binary],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (build.exitCode !== 0) {
    throw new Error(`Building the CLI failed: ${build.stderr.toString()}`);
  }
  testApp = await createTestApp();
  testApp.github.autoApproveDevices(makeGitHubUser("e2e"));
  apiUrl = testApp.listen();
}, 120_000);

afterAll(async () => {
  await testApp.close();
  await rm(workspace, { recursive: true, force: true });
});

describe("envy, end to end", () => {
  test("first run: login, init with import, pull, push, run, and a conflicting push", async () => {
    const homeA = join(workspace, "home-a");
    const homeB = join(workspace, "home-b");
    const projectA = join(workspace, "project-a");
    const projectB = join(workspace, "project-b");
    await Promise.all([mkdir(homeA), mkdir(homeB), mkdir(projectA), mkdir(projectB)]);
    await writeFile(join(projectA, ".env"), "API_URL=http://localhost\nFEATURE_FLAG=on\n");
    await writeFile(join(projectA, ".env.staging"), "API_URL=https://staging.example.invalid\n");
    await writeFile(join(projectA, ".env.example"), "API_URL=\n");

    // Machine A: first sign-in sets up keys and shows the recovery key.
    const loginA = await runEnvy(["login"], { cwd: projectA, home: homeA });
    expect(loginA.stderr).toContain("recovery key");
    expect(loginA.stderr).toContain("Signed in as @e2e");
    expect(loginA.exitCode).toBe(0);

    const init = await runEnvy(["init", "--create", "E2E App", "--yes"], {
      cwd: projectA,
      home: homeA,
    });
    expect(init.stderr).toContain("Linked to E2E App");
    expect(init.stderr).toContain("2 from .env → development");
    expect(init.stderr).toContain("1 from .env.staging → staging");
    expect(init.exitCode).toBe(0);
    expect(await readFile(join(projectA, ".gitignore"), "utf8")).toContain(".env.*");
    const link: unknown = JSON.parse(await readFile(join(projectA, ".envy.json"), "utf8"));
    expect(link).toMatchObject({ defaultEnvironment: "development", file: ".env" });

    await rm(join(projectA, ".env"));
    const pullA = await runEnvy(["pull"], { cwd: projectA, home: homeA });
    expect(pullA.stderr).toContain("Pulled 2 variables from development → .env");
    expect(await readEnv(join(projectA, ".env"))).toEqual({
      API_URL: "http://localhost",
      FEATURE_FLAG: "on",
    });

    await writeFile(
      join(projectA, ".env"),
      "API_URL=http://localhost\nFEATURE_FLAG=off\nNEW_KEY=42\n",
    );
    const pushA = await runEnvy(["push", "--yes"], { cwd: projectA, home: homeA });
    expect(pushA.stderr).toContain("+ NEW_KEY");
    expect(pushA.stderr).toContain("~ FEATURE_FLAG");
    expect(pushA.stderr).not.toContain("42");
    expect(pushA.stderr).toContain("Pushed version 2 of development");
    expect(pushA.exitCode).toBe(0);

    const runA = await runEnvy(
      [
        "run",
        "--",
        process.execPath,
        "-e",
        "console.log(process.env.NEW_KEY + ':' + process.env.FEATURE_FLAG)",
      ],
      { cwd: projectA, home: homeA },
    );
    expect(runA.stdout.trim()).toBe("42:off");
    const exitCode = await runEnvy(["run", "--", process.execPath, "-e", "process.exit(7)"], {
      cwd: projectA,
      home: homeA,
    });
    expect(exitCode.exitCode).toBe(7);

    // Machine B: same account, already set up, so it unlocks with the master password.
    await cp(join(projectA, ".envy.json"), join(projectB, ".envy.json"));
    const loginB = await runEnvy(["login"], { cwd: projectB, home: homeB });
    expect(loginB.exitCode).toBe(0);
    expect(loginB.stderr).not.toContain("recovery key");
    const pullB = await runEnvy(["pull"], { cwd: projectB, home: homeB });
    expect(pullB.exitCode).toBe(0);
    expect(await readEnv(join(projectB, ".env"))).toMatchObject({ NEW_KEY: "42" });

    // A pushes again; B's push is now based on an old version.
    const setA = await runEnvy(["set", "FROM_A=1"], { cwd: projectA, home: homeA });
    expect(setA.stderr).toContain("version 3");
    await writeFile(join(projectB, ".env"), "API_URL=http://localhost\nFROM_B=1\n");
    const conflict = await runEnvy(["push", "--yes"], { cwd: projectB, home: homeB });
    expect(conflict.exitCode).toBe(1);
    expect(conflict.stderr).toContain("development is at version 3, but you last pulled version 2");
    expect(conflict.stderr).toContain("--force");

    const forced = await runEnvy(["push", "--yes", "--force"], { cwd: projectB, home: homeB });
    expect(forced.stderr).toContain("Pushed version 4 of development");

    const get = await runEnvy(["get", "FROM_B"], { cwd: projectA, home: homeA });
    expect(get.stdout).toBe("1\n");
  }, 120_000);

  test("protected environments need --env and --yes; errors give the next step and exit code", async () => {
    const home = join(workspace, "home-a");
    const project = join(workspace, "project-a");

    const automatic = await runEnvy(["pull"], {
      cwd: project,
      home,
      env: { ENVY_ENV: "production" },
    });
    expect(automatic.exitCode).toBe(1);
    expect(automatic.stderr).toContain("Pass --env production");

    const unconfirmed = await runEnvy(["pull", "--env", "production"], { cwd: project, home });
    expect(unconfirmed.exitCode).toBe(1);
    expect(unconfirmed.stderr).toContain("--yes");

    const confirmed = await runEnvy(["pull", "--env", "production", "--yes"], {
      cwd: project,
      home,
    });
    expect(confirmed.exitCode).toBe(0);

    const strangerHome = join(workspace, "home-stranger");
    await mkdir(strangerHome);
    const notSignedIn = await runEnvy(["pull"], { cwd: project, home: strangerHome });
    expect(notSignedIn.exitCode).toBe(2);
    expect(notSignedIn.stderr).toContain("Run envy login.");

    const notLinked = await runEnvy(["pull"], { cwd: workspace, home });
    expect(notLinked.exitCode).toBe(1);
    expect(notLinked.stderr).toContain("Run envy init.");
  }, 60_000);
});
