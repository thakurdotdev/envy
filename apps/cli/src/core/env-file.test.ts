import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectEnvFilePath } from "./env-file.ts";
import type { FoundProjectLink } from "./project-link.ts";

let root: string;
let project: string;
let outside: string;

function foundWithFile(file: string): FoundProjectLink {
  const link = { projectId: "p", defaultEnvironment: "development", file, branches: {} };
  return { link, folder: project, path: join(project, ".envy.json") };
}

/** The error message for a refused path, or "allowed". */
async function outcomeFor(file: string): Promise<string> {
  try {
    await projectEnvFilePath(foundWithFile(file));
    return "allowed";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "envy-env-file-"));
  project = join(root, "project");
  outside = join(root, "outside");
  await mkdir(project);
  await mkdir(outside);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("projectEnvFilePath", () => {
  test("allows a file that does not exist yet, in a new folder", async () => {
    expect(await projectEnvFilePath(foundWithFile("config/.env"))).toBe(
      join(project, "config/.env"),
    );
  });

  test("allows a link that stays inside the project", async () => {
    await writeFile(join(project, "real.env"), "A=1\n");
    await symlink(join(project, "real.env"), join(project, ".env"));
    expect(await projectEnvFilePath(foundWithFile(".env"))).toBe(join(project, ".env"));
  });

  test("refuses a file that is a link to somewhere outside", async () => {
    await writeFile(join(outside, "target"), "A=1\n");
    await symlink(join(outside, "target"), join(project, ".env"));
    expect(await outcomeFor(".env")).toContain("outside this project");
  });

  test("refuses a new file inside a folder that links outside", async () => {
    await symlink(outside, join(project, "config"));
    expect(await outcomeFor("config/new.env")).toContain("outside this project");
    expect(await outcomeFor("config/deeper/new.env")).toContain("outside this project");
  });
});
