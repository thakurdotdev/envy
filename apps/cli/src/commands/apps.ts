import { stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { addApp, appNameFromFolder } from "../core/apps.ts";
import { CliError } from "../core/errors.ts";
import {
  isInsideFolder,
  LINK_FILE_NAME,
  normalizeAppPath,
  requireProjectLink,
  writeProjectLink,
} from "../core/project-link.ts";
import { listApps } from "../core/secrets.ts";
import { openSession } from "../core/session.ts";
import { getUnlockedKeys } from "../core/unlock.ts";
import { output } from "../ui/output.ts";
import { askConfirm } from "../ui/prompts.ts";

// envy apps: the apps of a monorepo (ADR 0018). Each app is a folder with
// its own .env file and its own environments, layered on the root ones.

export async function listProjectApps(options: { json?: boolean }): Promise<void> {
  const found = await requireProjectLink();
  const apps = await listApps(await openSession(), found.link.projectId);
  const rows = apps.map((app) => ({
    name: app.name,
    path: found.link.apps[app.name]?.path ?? null,
    file: found.link.apps[app.name]?.file ?? null,
  }));
  if (options.json === true) {
    output.result(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    output.success("This project has no apps. Add one with envy apps add <folder>.");
    return;
  }
  for (const row of rows) {
    const where =
      row.path === null ? `not in ${LINK_FILE_NAME}` : `${row.path}/${row.file ?? ".env"}`;
    output.result(`${row.name.padEnd(20)} ${where}`);
  }
}

export type AddAppOptions = {
  name?: string;
  file?: string;
  /** False with --no-inherit-root. */
  inheritRoot?: boolean;
  yes?: boolean;
};

/** Adds a folder of the repo as an app, with an environment for each stage. */
export async function addAppCommand(folder: string, options: AddAppOptions): Promise<void> {
  const found = await requireProjectLink();
  const path = normalizeAppPath(relative(found.folder, resolve(folder)));
  if (path === undefined || !isInsideFolder(path)) {
    throw new CliError(`${folder} is not a folder inside this repo.`, {
      hint: `Give a folder under ${found.folder}, such as apps/web.`,
    });
  }
  if ((await stat(resolve(folder)).catch(() => undefined))?.isDirectory() !== true) {
    throw new CliError(`There is no folder ${folder}.`);
  }
  if (Object.values(found.link.apps).some((app) => app.path === path)) {
    throw new CliError(`${path} is already an app.`, { hint: "Run envy apps ls." });
  }
  const session = await openSession();
  const keys = await getUnlockedKeys(session);
  const name = options.name ?? appNameFromFolder(path);
  const { link, created, imported } = await addApp({
    session,
    keys,
    found,
    path,
    name,
    file: options.file,
    inheritRoot: options.inheritRoot,
    importOptions: { yes: options.yes === true },
  });
  await writeProjectLink(found.folder, link);
  const importSummary =
    imported.length === 0
      ? ""
      : ` Imported ${imported.map((item) => `${item.count} from ${item.file} → ${item.environment}`).join(", ")}.`;
  output.success(
    `${created ? "Added" : "Linked"} the app ${name} (${path}).${importSummary} Commit ${LINK_FILE_NAME}.`,
  );
}

/** Removes an app for everyone: its secrets are no longer served and its tokens stop. */
export async function removeAppCommand(name: string, options: { yes?: boolean }): Promise<void> {
  const found = await requireProjectLink();
  const session = await openSession();
  const app = (await listApps(session, found.link.projectId)).find(
    (candidate) => candidate.name === name,
  );
  if (app === undefined && !Object.hasOwn(found.link.apps, name)) {
    throw new CliError(`This project has no app called ${name}.`, { hint: "Run envy apps ls." });
  }
  if (app !== undefined) {
    if (options.yes !== true) {
      const confirmed = await askConfirm(
        `Remove ${name} for everyone? Its secrets will no longer be served, and its service tokens stop working.`,
        `Add --yes to remove ${name}.`,
      );
      if (!confirmed) {
        throw new CliError("Stopped. Nothing was changed.");
      }
    }
    await session.call((api) => api.v1.apps({ id: app.id }).delete());
  }
  const apps = Object.fromEntries(
    Object.entries(found.link.apps).filter(([appName]) => appName !== name),
  );
  await writeProjectLink(found.folder, { ...found.link, apps });
  output.success(`Removed the app ${name}. Commit ${LINK_FILE_NAME}.`);
}
