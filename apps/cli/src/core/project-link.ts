import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CliError, notLinked } from "./errors.ts";
import { writeFileSafely } from "./settings.ts";

export const LINK_FILE_NAME = ".envy.json";
const SCHEMA_URL = "https://envy.dev/schema/v1.json";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `.envy.json`: committed to the repo, holds no secrets. */
export type ProjectLink = {
  projectId: string;
  defaultEnvironment: string;
  /** The file `envy pull` writes, relative to the folder of `.envy.json`. */
  file: string;
  /** Git branch name → environment name. */
  branches: Record<string, string>;
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
  const { projectId, defaultEnvironment, file, branches } = record;
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
  return { projectId, defaultEnvironment, file: fileName, branches: branchMap };
}

export async function writeProjectLink(folder: string, link: ProjectLink): Promise<string> {
  const path = join(folder, LINK_FILE_NAME);
  const content = {
    $schema: SCHEMA_URL,
    projectId: link.projectId,
    defaultEnvironment: link.defaultEnvironment,
    file: link.file,
    ...(Object.keys(link.branches).length > 0 ? { branches: link.branches } : {}),
  };
  await writeFileSafely(path, `${JSON.stringify(content, null, 2)}\n`, 0o644);
  return path;
}
