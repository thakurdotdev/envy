import { join } from "node:path";
import { loadEnvironmentVariables, type ProjectContext } from "./context.ts";
import { readEnvFile } from "./env-file.ts";

export type KeyCheck = { check: string; status: "ok" | "warning"; message: string };

/** Names in `wanted` that `have` does not set. Values are never looked at. */
export function missingNames(
  wanted: Record<string, string>,
  have: Record<string, string>,
): string[] {
  return Object.keys(wanted).filter((name) => !Object.hasOwn(have, name));
}

/**
 * Compares .env.example with what envy stores for the environment (what
 * `envy run` would inject), and says when the local .env is behind envy.
 * Falls back to the local .env only when checking envy would mean asking
 * for the master password.
 */
export async function checkKeys(context: ProjectContext): Promise<KeyCheck[]> {
  const folder = context.found.folder;
  const fileName = context.found.link.file;
  const example = await readEnvFile(join(folder, ".env.example")).catch(() => undefined);
  const local = await readEnvFile(join(folder, fileName)).catch(() => undefined);
  const name = context.environment.name;

  if (!context.canUnlockWithoutAsking) {
    if (example === undefined || local === undefined) {
      return [];
    }
    const missing = missingNames(example, local);
    return [
      {
        check: "missing keys",
        status: missing.length === 0 ? "ok" : "warning",
        message:
          missing.length === 0
            ? `${fileName} sets every key in .env.example (envy itself was not checked: it is locked)`
            : `Missing from your local ${fileName}: ${missing.join(", ")}. Run envy pull to update it, or unlock envy to check what it stores.`,
      },
    ];
  }

  const stored = await loadEnvironmentVariables(context);
  const checks: KeyCheck[] = [];
  if (example !== undefined) {
    const missing = missingNames(example, stored);
    checks.push({
      check: "missing keys",
      status: missing.length === 0 ? "ok" : "warning",
      message:
        missing.length === 0
          ? `${name} sets every key in .env.example`
          : `${name} does not set ${missing.join(", ")} (listed in .env.example). Add them with envy set NAME, or remove them from .env.example.`,
    });
  }
  if (local !== undefined) {
    const behind = missingNames(stored, local);
    checks.push({
      check: "local file",
      status: behind.length === 0 ? "ok" : "warning",
      message:
        behind.length === 0
          ? `${fileName} has every key envy stores for ${name}`
          : `${fileName} is behind envy (no ${behind.join(", ")}). Run envy pull.`,
    });
  }
  return checks;
}
