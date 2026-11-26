import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { normalizeAppPath } from "./project-link.ts";

// Finds the folders of a monorepo that could be apps (ADR 0018): the
// workspaces that package.json or pnpm-workspace.yaml list, and any folder
// near the top that already holds a .env file.

const SKIPPED_FOLDERS = new Set(["node_modules", "dist", "build", "out", "coverage", "vendor"]);
const MAX_DEPTH = 3;
const ENV_FILE = /^\.env(\.[\w-]+)?$/;
const NOT_SECRETS = new Set([".env.example", ".env.sample", ".env.template"]);

export type WorkspaceFolder = {
  /** Relative to the repo root, with / between parts. */
  path: string;
  /** True when it already has a .env file to import. */
  hasEnvFiles: boolean;
};

export async function findWorkspaceFolders(root: string): Promise<WorkspaceFolder[]> {
  const patterns = [...(await packageJsonWorkspaces(root)), ...(await pnpmWorkspaces(root))].filter(
    (pattern) => !pattern.startsWith("!"),
  );
  const paths = new Set<string>();
  for (const pattern of patterns) {
    for (const path of await expandFolderPattern(root, pattern)) {
      paths.add(path);
    }
  }
  for (const path of await foldersWithEnvFiles(root, "", 1)) {
    paths.add(path);
  }
  const folders: WorkspaceFolder[] = [];
  for (const path of [...paths].toSorted()) {
    folders.push({ path, hasEnvFiles: await hasEnvFiles(join(root, path)) });
  }
  return folders;
}

async function packageJsonWorkspaces(root: string): Promise<string[]> {
  const text = await readFile(join(root, "package.json"), "utf8").catch(() => undefined);
  if (text === undefined) {
    return [];
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof value !== "object" || value === null || !("workspaces" in value)) {
    return [];
  }
  // "workspaces": [...] (npm, Yarn, Bun) or { "packages": [...] } (older Yarn).
  const workspaces: unknown = value.workspaces;
  const list =
    typeof workspaces === "object" && workspaces !== null && "packages" in workspaces
      ? workspaces.packages
      : workspaces;
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
}

/** The `packages:` list of pnpm-workspace.yaml, read line by line (no YAML library needed). */
async function pnpmWorkspaces(root: string): Promise<string[]> {
  const text = await readFile(join(root, "pnpm-workspace.yaml"), "utf8").catch(() => undefined);
  if (text === undefined) {
    return [];
  }
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inPackages = /^packages\s*:/.test(line);
      continue;
    }
    const item = /^\s+-\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line);
    if (inPackages && item?.[1] !== undefined) {
      patterns.push(item[1]);
    }
  }
  return patterns;
}

/** "apps/*" → the folders directly in apps; "tools/cli" → itself; "**" goes a few levels down. */
async function expandFolderPattern(root: string, pattern: string): Promise<string[]> {
  const parts = (normalizeAppPath(pattern) ?? "").split("/").filter((part) => part !== "");
  let current = [""];
  for (const part of parts) {
    const next: string[] = [];
    for (const base of current) {
      if (part === "**") {
        next.push(base, ...(await subfolders(root, base, MAX_DEPTH)));
      } else if (part.includes("*")) {
        const matcher = new RegExp(`^${part.split("*").map(escapeRegExp).join("[^/]*")}$`);
        next.push(
          ...(await subfolders(root, base, 1)).filter((path) =>
            matcher.test(path.split("/").at(-1) ?? ""),
          ),
        );
      } else if (await isFolder(join(root, base, part))) {
        next.push(base === "" ? part : `${base}/${part}`);
      }
    }
    current = next;
  }
  return current.filter((path) => path !== "");
}

async function foldersWithEnvFiles(root: string, base: string, depth: number): Promise<string[]> {
  if (depth > MAX_DEPTH) {
    return [];
  }
  const found: string[] = [];
  for (const path of await subfolders(root, base, 1)) {
    if (await hasEnvFiles(join(root, path))) {
      found.push(path);
    }
    found.push(...(await foldersWithEnvFiles(root, path, depth + 1)));
  }
  return found;
}

/** Folders under `base`, `depth` levels deep at most, without hidden or build folders. */
async function subfolders(root: string, base: string, depth: number): Promise<string[]> {
  if (depth < 1) {
    return [];
  }
  const entries = await readdir(join(root, base), { withFileTypes: true }).catch(() => []);
  const result: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || SKIPPED_FOLDERS.has(entry.name)) {
      continue;
    }
    const path = base === "" ? entry.name : `${base}/${entry.name}`;
    result.push(path, ...(await subfolders(root, path, depth - 1)));
  }
  return result;
}

async function hasEnvFiles(folder: string): Promise<boolean> {
  const files = await readdir(folder).catch(() => []);
  return files.some((file) => ENV_FILE.test(file) && !NOT_SECRETS.has(file));
}

async function isFolder(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() === true;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
