import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

// The look the team chose bans four things in the web app: uppercase labels,
// gradients, em dashes and emoji. This test reads every source file and lists
// each line that breaks a rule, as file:line, so a slip is caught early.

const webFolder = join(import.meta.dir, "..");
const scannedFolders = ["app", "components"].map((folder) => join(webFolder, folder));
const scannedExtensions = [".ts", ".tsx", ".css"];

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "uppercase class", pattern: /\buppercase\b/ },
  {
    name: "gradient",
    pattern: /bg-gradient-|bg-linear-|bg-radial-|bg-conic-|(?:linear|radial|conic)-gradient\(/,
  },
  { name: "em dash", pattern: /—/ },
  // Pictures such as faces or the heavy check mark. Plain symbols (© ™ → ✓) are fine.
  { name: "emoji", pattern: /(?![©®™←-⇿✓])\p{Extended_Pictographic}/u },
];

async function listSourceFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => scannedExtensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function findViolations(): Promise<string[]> {
  const files = (await Promise.all(scannedFolders.map(listSourceFiles))).flat();
  const violations: string[] = [];
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          violations.push(`${relative(webFolder, file)}:${index + 1} ${rule.name}`);
        }
      }
    });
  }
  return violations;
}

describe("design bans", () => {
  test("no uppercase labels, gradients, em dashes or emoji in the web app", async () => {
    expect(await findViolations()).toEqual([]);
  });
});
