import { generateEnvKey, toBase64Url, wrapEnvKey, clearKey } from "@envy/crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readEnvFile } from "../core/env-file.ts";
import type { EnvironmentSummary } from "../core/environment.ts";
import { CliError } from "../core/errors.ts";
import { updateGitignore } from "../core/gitignore.ts";
import { findProjectLink, LINK_FILE_NAME, writeProjectLink } from "../core/project-link.ts";
import { listEnvironments, pushEnvironment } from "../core/secrets.ts";
import { openSession, type Session } from "../core/session.ts";
import { setPulledVersion } from "../core/settings.ts";
import { getUnlockedKeys, type UnlockedKeys } from "../core/unlock.ts";
import { output } from "../ui/output.ts";
import { askMultiSelect, askSelect, askText, isInteractive } from "../ui/prompts.ts";

export type InitOptions = {
  project?: string;
  create?: string;
  yes?: boolean;
  force?: boolean;
};

const STARTER_ENVIRONMENTS = ["shared", "development", "staging", "production"] as const;
const DEFAULT_ENVIRONMENT = "development";
const CREATE_NEW = "__create_new__";
// Files that describe variables instead of holding them, or that belong to one machine.
const NOT_IMPORTED = new Set([".env.example", ".env.sample", ".env.template"]);

export async function init(options: InitOptions): Promise<void> {
  const folder = process.cwd();
  const existing = await findProjectLink(folder);
  if (existing !== undefined && existing.folder === folder && options.force !== true) {
    throw new CliError(`This folder is already linked (${LINK_FILE_NAME}).`, {
      hint: "Run envy pull, or envy init --force to link it to another project.",
    });
  }

  const session = await openSession();
  const keys = await getUnlockedKeys(session);
  const project = await chooseOrCreateProject(session, keys, options);
  const environments = await listEnvironments(session, project.id);

  const imported = await importEnvFiles(session, keys, project.id, environments, folder, options);
  await writeProjectLink(folder, {
    projectId: project.id,
    defaultEnvironment: environments.some((environment) => environment.name === DEFAULT_ENVIRONMENT)
      ? DEFAULT_ENVIRONMENT
      : (environments.find((environment) => !environment.isShared && !environment.isProtected)
          ?.name ?? DEFAULT_ENVIRONMENT),
    file: ".env",
    branches: {},
  });
  const gitignoreChanged = await updateGitignore(folder);

  if (gitignoreChanged) {
    output.info("Added .env files to .gitignore.");
  }
  const importSummary =
    imported.length === 0
      ? ""
      : ` Imported ${imported.map((item) => `${item.count} from ${item.file} → ${item.environment}`).join(", ")}.`;
  output.success(
    `Linked to ${project.name}.${importSummary} Commit ${LINK_FILE_NAME}, then run: envy run -- <your command>`,
  );
}

async function chooseOrCreateProject(session: Session, keys: UnlockedKeys, options: InitOptions) {
  if (options.create !== undefined) {
    return createProject(session, keys, options.create);
  }
  const { items } = await session.call((api) => api.v1.projects.get({ query: { limit: 100 } }));
  if (options.project !== undefined) {
    const match = items.find(
      (item) => item.id === options.project || item.slug === options.project,
    );
    if (match === undefined) {
      throw new CliError(`You have no project called "${options.project}".`, {
        hint: "Check the name, or create it with envy init --create <name>.",
      });
    }
    return match;
  }
  const hint = "Pass --project <name> or --create <name>.";
  const choice =
    items.length === 0 && !isInteractive()
      ? CREATE_NEW
      : await askSelect(
          "Which project should this folder use?",
          [
            ...items.map((item) => ({ value: item.id, label: item.name, hint: item.role })),
            { value: CREATE_NEW, label: "Create a new project" },
          ],
          hint,
        );
  if (choice !== CREATE_NEW) {
    const match = items.find((item) => item.id === choice);
    if (match !== undefined) {
      return match;
    }
  }
  const folderName = process.cwd().split(/[\\/]/).at(-1) ?? "my-app";
  const name = await askText(`Project name (for example ${folderName})`, hint);
  return createProject(session, keys, name.trim() === "" ? folderName : name.trim());
}

/** Makes the four starter environment keys here and sends them wrapped for the owner. */
async function createProject(session: Session, keys: UnlockedKeys, name: string) {
  const environmentKeys: Record<(typeof STARTER_ENVIRONMENTS)[number], string> = {
    shared: "",
    development: "",
    staging: "",
    production: "",
  };
  for (const environmentName of STARTER_ENVIRONMENTS) {
    const envKey = await generateEnvKey();
    environmentKeys[environmentName] = await toBase64Url(await wrapEnvKey(envKey, keys.publicKey));
    await clearKey(envKey);
  }
  return session.call((api) => api.v1.projects.post({ name, environmentKeys }));
}

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

async function importEnvFiles(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
  environments: EnvironmentSummary[],
  folder: string,
  options: InitOptions,
) {
  const candidates = await findImportCandidates(folder, environments);
  if (candidates.length === 0) {
    return [];
  }
  let chosen = candidates;
  if (options.yes !== true) {
    if (!isInteractive()) {
      output.info(
        `Found ${candidates.map((candidate) => candidate.file).join(", ")}. Add --yes to import them.`,
      );
      return [];
    }
    const picked = await askMultiSelect(
      "Import these files?",
      candidates.map((candidate) => ({
        value: candidate.file,
        label: `${candidate.file} → ${candidate.environment.name}`,
      })),
      "Add --yes to import them.",
    );
    chosen = candidates.filter((candidate) => picked.includes(candidate.file));
  }

  const imported: Array<{ file: string; environment: string; count: number }> = [];
  for (const candidate of chosen) {
    if (candidate.environment.latestVersion > 0) {
      output.warn(
        `${candidate.environment.name} already has secrets, so ${candidate.file} was not imported. Use envy push --env ${candidate.environment.name}.`,
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
      message: `Imported from ${candidate.file}`,
    });
    await setPulledVersion(candidate.environment.id, version);
    imported.push({
      file: candidate.file,
      environment: candidate.environment.name,
      count: Object.keys(secrets).length,
    });
  }
  return imported;
}
