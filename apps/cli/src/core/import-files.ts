import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { output } from "../ui/output.ts";
import { askMultiSelect, isInteractive } from "../ui/prompts.ts";
import { readEnvFile } from "./env-file.ts";
import type { EnvironmentSummary } from "./environment.ts";
import { pushEnvironment } from "./secrets.ts";
import type { Session } from "./session.ts";
import { setPulledVersion } from "./settings.ts";
import type { UnlockedKeys } from "./unlock.ts";

// Importing the .env files already in a folder into empty environments, for
// envy init and envy apps add. `.env` goes to development; `.env.<name>` to
// the environment with that name.

const DEFAULT_ENVIRONMENT = "development";
// Files that describe variables instead of holding them, or that belong to one machine.
const NOT_IMPORTED = new Set([".env.example", ".env.sample", ".env.template"]);

/** Where the files are, and how to name things in messages. */
export type ImportPlace = {
  folder: string;
  /** "apps/web/" for an app, "" for the root. */
  fileLabelPrefix: string;
  /** "web/" for an app, "" for the root. */
  environmentLabelPrefix: string;
};

export type ImportOptions = { yes?: boolean };

type ImportCandidate = { file: string; environment: EnvironmentSummary };

/** `.env` goes to development; `.env.<name>` goes to the environment with that name. */
async function findImportCandidates(
  folder: string,
  environments: EnvironmentSummary[],
): Promise<ImportCandidate[]> {
  const files = (await readdir(folder)).filter(
    (file) =>
      /^\.env(\.[\w-]+)?$/.test(file) && !NOT_IMPORTED.has(file) && !file.endsWith(".local"),
  );
  const candidates: ImportCandidate[] = [];
  for (const file of files.toSorted()) {
    const environmentName = file === ".env" ? DEFAULT_ENVIRONMENT : file.slice(".env.".length);
    const environment = environments.find((candidate) => candidate.name === environmentName);
    if (environment === undefined) {
      continue;
    }
    // .env.development is more specific than .env, so it wins.
    const explicitFile = `.env.${environmentName}`;
    if (file === ".env" && files.includes(explicitFile)) {
      continue;
    }
    candidates.push({ file, environment });
  }
  return candidates;
}

export type ImportedFile = { file: string; environment: string; count: number };

/**
 * Offers to import the folder's .env files into the given environments (the
 * root's, or one app's), and imports the chosen ones into empty environments.
 */
export async function importEnvFiles(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
  environments: EnvironmentSummary[],
  place: ImportPlace,
  options: ImportOptions,
): Promise<ImportedFile[]> {
  const folder = place.folder;
  const fileLabel = (file: string) => `${place.fileLabelPrefix}${file}`;
  const environmentLabel = (name: string) => `${place.environmentLabelPrefix}${name}`;
  const candidates = await findImportCandidates(folder, environments);
  if (candidates.length === 0) {
    return [];
  }
  let chosen = candidates;
  if (options.yes !== true) {
    if (!isInteractive()) {
      output.info(
        `Found ${candidates.map((candidate) => fileLabel(candidate.file)).join(", ")}. Add --yes to import them.`,
      );
      return [];
    }
    const picked = await askMultiSelect(
      "Import these files?",
      candidates.map((candidate) => ({
        value: candidate.file,
        label: `${fileLabel(candidate.file)} → ${environmentLabel(candidate.environment.name)}`,
      })),
      "Add --yes to import them.",
    );
    chosen = candidates.filter((candidate) => picked.includes(candidate.file));
  }

  const imported: ImportedFile[] = [];
  for (const candidate of chosen) {
    if (candidate.environment.latestVersion > 0) {
      output.warn(
        `${environmentLabel(candidate.environment.name)} already has secrets, so ${fileLabel(candidate.file)} was not imported. Use envy push --env ${candidate.environment.name}.`,
      );
      continue;
    }
    const secrets = (await readEnvFile(join(folder, candidate.file))) ?? {};
    const version = await pushEnvironment({
      session,
      keys,
      projectId,
      environment: candidate.environment,
      secrets,
      baseVersion: 0,
      message: `Imported from ${fileLabel(candidate.file)}`,
    });
    await setPulledVersion(candidate.environment.id, version);
    imported.push({
      file: fileLabel(candidate.file),
      environment: environmentLabel(candidate.environment.name),
      count: Object.keys(secrets).length,
    });
  }
  return imported;
}
