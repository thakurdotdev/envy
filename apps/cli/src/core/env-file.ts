import { DotenvParseError, parseDotenv, serializeDotenv, type DotenvVariables } from "@envy/shared";
import { readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { writeFileSafely } from "./settings.ts";
import { CliError } from "./errors.ts";
import { isInsideFolder, type FoundProjectLink } from "./project-link.ts";

/**
 * The full path of the file `envy pull` writes and `envy push` reads.
 * Refuses a symbolic link that points outside the project folder: a cloned
 * repo could ship one to make envy read or replace some other file.
 */
export async function projectEnvFilePath(found: FoundProjectLink): Promise<string> {
  const path = join(found.folder, found.link.file);
  const target = await realpath(path).catch(() => undefined);
  if (target === undefined) {
    return path;
  }
  const folder = await realpath(found.folder);
  if (!isInsideFolder(relative(folder, target))) {
    throw new CliError(`${found.link.file} is a link to a file outside this project.`, {
      hint: `Replace ${found.link.file} with a regular file, then try again.`,
    });
  }
  return path;
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
