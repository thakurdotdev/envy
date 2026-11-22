import { DotenvParseError, parseDotenv, serializeDotenv, type DotenvVariables } from "@envy/shared";
import { readFile } from "node:fs/promises";
import { writeFileSafely } from "./settings.ts";
import { CliError } from "./errors.ts";

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
