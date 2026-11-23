import { DotenvParseError, parseDotenv, serializeDotenv, type DotenvVariables } from "@envy/shared";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { writeFileSafely } from "./settings.ts";
import { CliError } from "./errors.ts";
import { isInsideFolder, type FoundProjectLink } from "./project-link.ts";

/**
 * The full path of the file `envy pull` writes and `envy push` reads.
 * Refuses a path that leads outside the project folder through a symbolic
 * link, either the file itself or one of its folders: a cloned repo could
 * ship one to make envy read or replace some other file.
 */
export async function projectEnvFilePath(found: FoundProjectLink): Promise<string> {
  const path = join(found.folder, found.link.file);
  const folder = await realpath(found.folder);
  const target = await realpathOfNearestExisting(path);
  if (!isInsideFolder(relative(folder, target)) || target === folder) {
    throw new CliError(`${found.link.file} leads to a file outside this project.`, {
      hint: `Make ${found.link.file} and its folders regular files and folders, not links, then try again.`,
    });
  }
  return path;
}

/**
 * The real path of `path`, or of its nearest parent folder that exists when
 * the file is not there yet. A missing file is still checked this way,
 * because the folder it would be written into could be a link.
 */
async function realpathOfNearestExisting(path: string): Promise<string> {
  let current = path;
  const missingParts: string[] = [];
  for (;;) {
    const real = await realpath(current).catch(() => undefined);
    if (real !== undefined) {
      return join(real, ...missingParts);
    }
    const parent = dirname(current);
    if (parent === current) {
      return path;
    }
    missingParts.unshift(basename(current));
    current = parent;
  }
}

/** Reads a .env file. Returns undefined if it does not exist. */
export async function readEnvFile(path: string): Promise<DotenvVariables | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    return parseDotenv(text);
  } catch (error) {
    if (error instanceof DotenvParseError) {
      throw new CliError(`${path} could not be read. ${error.message}`, {
        hint: "Fix that line and try again.",
      });
    }
    throw error;
  }
}

/** Writes a .env file readable only by the current user. */
export async function writeEnvFile(path: string, variables: DotenvVariables): Promise<void> {
  await writeFileSafely(path, serializeDotenv(variables), 0o600);
}
