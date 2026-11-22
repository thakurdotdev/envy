import { join } from "node:path";
import { output } from "../ui/output.ts";
import { readEnvFile } from "./env-file.ts";

/**
 * Warns about keys listed in .env.example that the environment does not set,
 * so a missing variable shows up now instead of as a crash later.
 */
export async function warnAboutMissingKeys(
  folder: string,
  environmentName: string,
  variables: Record<string, string>,
): Promise<string[]> {
  const example = await readEnvFile(join(folder, ".env.example")).catch(() => undefined);
  if (example === undefined) {
    return [];
  }
  const missing = Object.keys(example).filter((key) => !Object.hasOwn(variables, key));
  if (missing.length > 0) {
    output.warn(`${environmentName} is missing ${missing.join(", ")} (listed in .env.example).`);
  }
  return missing;
}
