import { clearKey, generateEnvKey } from "@envy/crypto";
import { newUuidV7s } from "@envy/shared";
import { addApp, appNameFromFolder } from "../core/apps.ts";
import { wrapEnvKeyFor } from "../core/env-keys.ts";
import { CliError } from "../core/errors.ts";
import { updateGitignore } from "../core/gitignore.ts";
import { importEnvFiles, type ImportedFile } from "../core/import-files.ts";
import {
  findProjectLink,
  LINK_FILE_NAME,
  writeProjectLink,
  type FoundProjectLink,
} from "../core/project-link.ts";
import { listEnvironments } from "../core/secrets.ts";
import { openSession, type Session } from "../core/session.ts";
import { getUnlockedKeys, type UnlockedKeys } from "../core/unlock.ts";
import { findWorkspaceFolders } from "../core/workspaces.ts";
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
  const environments = (await listEnvironments(session, project.id)).filter(
    (environment) => environment.appId === null,
  );

  const imported = await importEnvFiles(
    session,
    keys,
    project.id,
    environments,
    { folder, fileLabelPrefix: "", environmentLabelPrefix: "" },
    options,
  );
  const link = {
    projectId: project.id,
    defaultEnvironment: environments.some((environment) => environment.name === DEFAULT_ENVIRONMENT)
      ? DEFAULT_ENVIRONMENT
      : (environments.find((environment) => !environment.isShared && !environment.isProtected)
          ?.name ?? DEFAULT_ENVIRONMENT),
    file: ".env",
    branches: {},
    apps: {},
  };
  await writeProjectLink(folder, link);
  const appsImported = await addWorkspaceApps(
    session,
    keys,
    {
      folder,
      path: `${folder}/${LINK_FILE_NAME}`,
      link,
    },
    options,
  );
  const gitignoreChanged = await updateGitignore(folder);

  if (gitignoreChanged) {
    output.info("Added .env files to .gitignore.");
  }
  const allImported = [...imported, ...appsImported];
  const importSummary =
    allImported.length === 0
      ? ""
      : ` Imported ${allImported.map((item) => `${item.count} from ${item.file} → ${item.environment}`).join(", ")}.`;
  output.success(
    `Linked to ${project.name}.${importSummary} Commit ${LINK_FILE_NAME}, then run: envy run -- <your command>`,
  );
}

/**
 * In a monorepo, offers to add each workspace folder as an app (ADR 0018).
 * Without a terminal, --yes adds the folders that already have .env files.
 */
async function addWorkspaceApps(
  session: Session,
  keys: UnlockedKeys,
  found: FoundProjectLink,
  options: InitOptions,
): Promise<ImportedFile[]> {
  const folders = await findWorkspaceFolders(found.folder);
  if (folders.length === 0) {
    return [];
  }
  let chosen: string[];
  if (isInteractive() && options.yes !== true) {
    chosen = await askMultiSelect(
      "Which folders should be apps, each with its own .env?",
      folders.map((folder) => ({
        value: folder.path,
        label: folder.path,
        ...(folder.hasEnvFiles ? { hint: "has .env files" } : {}),
      })),
      "Add apps later with envy apps add <folder>.",
      folders.filter((folder) => folder.hasEnvFiles).map((folder) => folder.path),
    );
  } else if (options.yes === true) {
    chosen = folders.filter((folder) => folder.hasEnvFiles).map((folder) => folder.path);
  } else {
    output.info(
      `Found ${folders.map((folder) => folder.path).join(", ")}. Add them with envy apps add <folder>.`,
    );
    return [];
  }

  const imported: ImportedFile[] = [];
  let current = found;
  for (const path of chosen) {
    const name = uniqueAppName(path, Object.keys(current.link.apps));
    const added = await addApp({
      session,
      keys,
      found: current,
      path,
      name,
      importOptions: { yes: options.yes === true },
    });
    // Saved after each app, so a failure later keeps the apps made so far.
    await writeProjectLink(current.folder, added.link);
    current = { ...current, link: added.link };
    imported.push(...added.imported);
    output.info(`Added the app ${name} (${path}).`);
  }
  return imported;
}

/** "apps/web" → "web", or "apps-web" when another folder already took "web". */
function uniqueAppName(path: string, taken: string[]): string {
  const short = appNameFromFolder(path);
  if (short !== "" && short !== "root" && !taken.includes(short)) {
    return short;
  }
  return appNameFromFolder(path.replaceAll("/", "-"));
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
  // Ids are chosen here so each key can be bound to its environment (ADR 0016).
  const ids = newUuidV7s(STARTER_ENVIRONMENTS.length);
  const environmentIds = { ...environmentKeys };
  for (const [index, environmentName] of STARTER_ENVIRONMENTS.entries()) {
    const environmentId = ids[index] ?? "";
    environmentIds[environmentName] = environmentId;
    const envKey = await generateEnvKey();
    environmentKeys[environmentName] = await wrapEnvKeyFor(envKey, keys, keys.publicKey, {
      environmentId,
      keyVersion: 1,
    });
    await clearKey(envKey);
  }
  return session.call((api) => api.v1.projects.post({ name, environmentKeys, environmentIds }));
}
