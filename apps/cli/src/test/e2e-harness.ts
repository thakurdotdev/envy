import { createTestApp, type TestApp } from "@envy/api/testing";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Builds the real single-file binary and runs it against a real API server
// (with a fake GitHub), exactly as a user would from a terminal, except that
// nobody is there to answer prompts.

export const MASTER_PASSWORD = "e2e master password";

export type RunResult = { exitCode: number; stdout: string; stderr: string };

export type E2eHarness = {
  testApp: TestApp;
  workspace: string;
  runEnvy(
    args: string[],
    options: { cwd: string; home: string; env?: Record<string, string> },
  ): Promise<RunResult>;
  close(): Promise<void>;
};

export async function startE2eHarness(): Promise<E2eHarness> {
  const workspace = await mkdtemp(join(tmpdir(), "envy-e2e-"));
  const binary = join(workspace, "envy");
  const build = Bun.spawnSync(
    ["bun", "build", join(import.meta.dir, "..", "index.ts"), "--compile", "--outfile", binary],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (build.exitCode !== 0) {
    throw new Error(`Building the CLI failed: ${build.stderr.toString()}`);
  }
  const testApp = await createTestApp();
  const apiUrl = testApp.listen();

  return {
    testApp,
    workspace,
    async runEnvy(args, options) {
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
    },
    async close() {
      await testApp.close();
      await rm(workspace, { recursive: true, force: true });
    },
  };
}
