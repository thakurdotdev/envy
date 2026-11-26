import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findWorkspaceFolders } from "./workspaces.ts";

let root: string;

async function makeFolders(...paths: string[]): Promise<void> {
  for (const path of paths) {
    await mkdir(join(root, path), { recursive: true });
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "envy-workspaces-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("finding the folders of a monorepo", () => {
  test("reads package.json workspaces and notes which folders have .env files", async () => {
    await makeFolders("apps/api", "apps/web", "packages/ui", "node_modules/x", "docs");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ workspaces: ["apps/*", "packages/*"] }),
    );
    await writeFile(join(root, "apps/api/.env"), "A=1\n");
    await writeFile(join(root, "apps/web/.env.example"), "B=\n");

    expect(await findWorkspaceFolders(root)).toEqual([
      { path: "apps/api", hasEnvFiles: true },
      { path: "apps/web", hasEnvFiles: false },
      { path: "packages/ui", hasEnvFiles: false },
    ]);
  });

  test("reads pnpm-workspace.yaml, and finds .env folders that no workspace lists", async () => {
    await makeFolders("services/billing", "tools/seed", "node_modules/pkg");
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'services/*'\n  - \"!services/old\"\ncatalog:\n  - nope/*\n",
    );
    await writeFile(join(root, "tools/seed/.env.development"), "C=1\n");
    await writeFile(join(root, "node_modules/pkg/.env"), "D=1\n");

    expect(await findWorkspaceFolders(root)).toEqual([
      { path: "services/billing", hasEnvFiles: false },
      { path: "tools/seed", hasEnvFiles: true },
    ]);
  });
});
