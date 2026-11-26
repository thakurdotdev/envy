import { NAME_PATTERN, ROOT_APP_NAME } from "@envy/shared";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, resolve, win32 } from "node:path";
import { CliError, notLinked } from "./errors.ts";
import { writeFileSafely } from "./settings.ts";

export const LINK_FILE_NAME = ".envy.json";
const SCHEMA_URL = "https://envy.dev/schema/v1.json";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME = new RegExp(NAME_PATTERN);

/** One app of a monorepo (ADR 0018). */
export type AppLink = {
  /** The app's folder, relative to the folder of `.envy.json`, with / between parts. */
  path: string;
  /** The file `envy pull` writes, relative to the app's folder. */
  file: string;
  /** False when the app skips the root stage layer and gets only shared under its own. */
  inheritRoot: boolean;
};

/** `.envy.json`: committed to the repo, holds no secrets. */
export type ProjectLink = {
  projectId: string;
  defaultEnvironment: string;
  /** The file `envy pull` writes, relative to the folder of `.envy.json`. */
  file: string;
  /** Git branch name → environment name. */
  branches: Record<string, string>;
  /** App name → its folder and file. Empty for a single-folder project. */
  apps: Record<string, AppLink>;
};

export type FoundProjectLink = { link: ProjectLink; folder: string; path: string };

/** Looks for `.envy.json` in this folder and its parents, like git does for `.git`. */
export async function findProjectLink(
  startFolder = process.cwd(),
): Promise<FoundProjectLink | undefined> {
  let folder = resolve(startFolder);
  for (;;) {
    const path = join(folder, LINK_FILE_NAME);
    const text = await readFile(path, "utf8").catch(() => undefined);
    if (text !== undefined) {
      return { link: parseProjectLink(text, path), folder, path };
    }
    const parent = dirname(folder);
    if (parent === folder) {
      return undefined;
    }
    folder = parent;
  }
}

export async function requireProjectLink(): Promise<FoundProjectLink> {
  const found = await findProjectLink();
  if (found === undefined) {
    throw notLinked();
  }
  return found;
}

export function parseProjectLink(text: string, path: string): ProjectLink {
  const invalid = (problem: string) =>
    new CliError(`${path} is not valid: ${problem}.`, {
      hint: "Fix the file, or delete it and run envy init.",
    });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid("it is not JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("it must be a JSON object");
  }
  const record = Object.fromEntries(Object.entries(value));
  const { projectId, defaultEnvironment, file, branches, apps } = record;
  if (typeof projectId !== "string" || !UUID_PATTERN.test(projectId)) {
    throw invalid('"projectId" must be a project id');
  }
  if (typeof defaultEnvironment !== "string" || defaultEnvironment === "") {
    throw invalid('"defaultEnvironment" must be an environment name');
  }
  const fileName = file ?? ".env";
  if (typeof fileName !== "string" || fileName === "") {
    throw invalid('"file" must be a file name');
  }
  // The file is committed with the repo, so someone else may have written
  // it: envy pull must never write, and envy push never read, outside it.
  if (!isInsideFolder(fileName)) {
    throw invalid('"file" must be a path inside this folder, such as .env');
  }
  const branchMap: Record<string, string> = {};
  if (branches !== undefined) {
    if (typeof branches !== "object" || branches === null || Array.isArray(branches)) {
      throw invalid('"branches" must map branch names to environment names');
    }
    for (const [branch, environment] of Object.entries(branches)) {
      if (typeof environment !== "string") {
        throw invalid(`"branches.${branch}" must be an environment name`);
      }
      branchMap[branch] = environment;
    }
  }
  return {
    projectId,
    defaultEnvironment,
    file: fileName,
    branches: branchMap,
    apps: parseApps(apps, invalid),
  };
}

function parseApps(
  value: unknown,
  invalid: (problem: string) => CliError,
): Record<string, AppLink> {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid('"apps" must map app names to their folders');
  }
  const apps: Record<string, AppLink> = {};
  const paths = new Set<string>();
  for (const [name, entry] of Object.entries(value)) {
    if (!NAME.test(name) || name === ROOT_APP_NAME) {
      throw invalid(`"apps.${name}" is not a valid app name`);
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw invalid(`"apps.${name}" must be an object with a "path"`);
    }
    const fields = Object.fromEntries(Object.entries(entry));
    const path = typeof fields["path"] === "string" ? normalizeAppPath(fields["path"]) : undefined;
    // Same reason as "file": the folder must not lead outside the repo.
    if (path === undefined || !isInsideFolder(path)) {
      throw invalid(`"apps.${name}.path" must be a folder inside this one, such as apps/${name}`);
    }
    if (paths.has(path)) {
      throw invalid(`two apps use the folder ${path}`);
    }
    paths.add(path);
    const file = fields["file"] ?? ".env";
    if (typeof file !== "string" || file === "" || !isInsideFolder(file)) {
      throw invalid(`"apps.${name}.file" must be a path inside the app folder, such as .env`);
    }
    const inheritRoot = fields["inheritRoot"] ?? true;
    if (typeof inheritRoot !== "boolean") {
      throw invalid(`"apps.${name}.inheritRoot" must be true or false`);
    }
    apps[name] = { path, file, inheritRoot };
  }
  return apps;
}

/**
 * "./apps/web/" → "apps/web". Undefined for the repo root itself, which is
 * the root, not an app.
 */
export function normalizeAppPath(path: string): string | undefined {
  const normalized = posix.normalize(path.replaceAll("\\", "/")).replace(/\/+$/, "");
  return normalized === "." || normalized === "" ? undefined : normalized;
}

/** True for a relative path that cannot point above the folder it starts in. */
export function isInsideFolder(path: string): boolean {
  if (isAbsolute(path) || win32.isAbsolute(path) || path.includes("\0")) {
    return false;
  }
  return path.split(/[\\/]/).every((part) => part !== "..");
}

export async function writeProjectLink(folder: string, link: ProjectLink): Promise<string> {
  const path = join(folder, LINK_FILE_NAME);
  const content = {
    $schema: SCHEMA_URL,
    projectId: link.projectId,
    defaultEnvironment: link.defaultEnvironment,
    file: link.file,
    ...(Object.keys(link.branches).length > 0 ? { branches: link.branches } : {}),
    ...(Object.keys(link.apps).length > 0 ? { apps: appsForFile(link.apps) } : {}),
  };
  await writeFileSafely(path, `${JSON.stringify(content, null, 2)}\n`, 0o644);
  return path;
}

// Only what differs from the defaults, so the committed file stays short.
function appsForFile(apps: Record<string, AppLink>) {
  return Object.fromEntries(
    Object.entries(apps)
      .toSorted(([first], [second]) => first.localeCompare(second))
      .map(([name, app]) => [
        name,
        {
          path: app.path,
          ...(app.file === ".env" ? {} : { file: app.file }),
          ...(app.inheritRoot ? {} : { inheritRoot: false }),
        },
      ]),
  );
}
