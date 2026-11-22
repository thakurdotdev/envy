import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Local secret files must never be committed. `.envy.json` holds no secrets
// and should be committed, so it is not listed.
const REQUIRED_LINES = [".env", ".env.*", "!.env.example"];

/** Returns the new .gitignore text, or undefined if nothing needs adding. */
export function addSecretFilesToGitignore(current: string): string | undefined {
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = REQUIRED_LINES.filter((line) => !existing.has(line));
  if (missing.length === 0) {
    return undefined;
  }
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  const spacer = current === "" ? "" : "\n";
  return `${current}${separator}${spacer}# Local secret files (managed by envy)\n${missing.join("\n")}\n`;
}

/** Updates .gitignore in the folder. Returns true if it changed. */
export async function updateGitignore(folder: string): Promise<boolean> {
  const path = join(folder, ".gitignore");
  const current = await readFile(path, "utf8").catch(() => "");
  const next = addSecretFilesToGitignore(current);
  if (next === undefined) {
    return false;
  }
  await writeFile(path, next);
  return true;
}
