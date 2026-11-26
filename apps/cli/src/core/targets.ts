import { ROOT_APP_NAME } from "@envy/shared";
import { join, relative, resolve } from "node:path";
import { CliError } from "./errors.ts";
import { isInsideFolder, type FoundProjectLink } from "./project-link.ts";

// A target is one place in the repo that `envy pull` writes and `envy push`
// reads: the root, or one app of a monorepo (ADR 0018).

export type Target = {
  /** The app's name, or undefined for the root. */
  app: string | undefined;
  /** The app's name, or "root", for messages and --app. */
  label: string;
  /** The folder relative to the repo root, with / between parts ("" for the root). */
  path: string;
  /** The folder, absolute. */
  folder: string;
  /** The file, relative to the folder. */
  file: string;
  /** False when the app skips the root stage layer. Always true for the root. */
  inheritRoot: boolean;
};

export type TargetChoice = { app?: string | undefined; all?: boolean | undefined };

export function rootTarget(found: FoundProjectLink): Target {
  return {
    app: undefined,
    label: ROOT_APP_NAME,
    path: "",
    folder: found.folder,
    file: found.link.file,
    inheritRoot: true,
  };
}

/** The root, then each app in name order. */
export function listTargets(found: FoundProjectLink): Target[] {
  const apps = Object.entries(found.link.apps)
    .toSorted(([first], [second]) => first.localeCompare(second))
    .map(([name, app]) => ({
      app: name,
      label: name,
      path: app.path,
      folder: join(found.folder, app.path),
      file: app.file,
      inheritRoot: app.inheritRoot,
    }));
  return [rootTarget(found), ...apps];
}

/** The file of a target as a path from the repo root, for messages: "apps/web/.env". */
export function targetFileLabel(target: Target): string {
  return target.path === "" ? target.file : `${target.path}/${target.file}`;
}

/** The app whose folder holds `folder` (the deepest one wins), or undefined outside every app. */
export function appTargetForFolder(found: FoundProjectLink, folder: string): Target | undefined {
  const candidates = listTargets(found).filter((target) => {
    if (target.app === undefined) {
      return false;
    }
    const inside = relative(target.folder, resolve(folder));
    return inside === "" || isInsideFolder(inside);
  });
  return candidates.toSorted((first, second) => second.path.length - first.path.length)[0];
}

/** One target, for commands that work on one place: --app, else the current folder's app, else the root. */
export function chooseTarget(
  found: FoundProjectLink,
  app: string | undefined,
  folder = process.cwd(),
): Target {
  if (app !== undefined) {
    return targetNamed(found, app);
  }
  return appTargetForFolder(found, folder) ?? rootTarget(found);
}

/**
 * The targets for `pull` and `push`: --app picks one and --all picks every
 * one. Otherwise, inside an app folder it is that app; anywhere else (such
 * as the repo root) it is the root and every app.
 */
export function chooseTargets(
  found: FoundProjectLink,
  choice: TargetChoice,
  folder = process.cwd(),
): Target[] {
  if (choice.app !== undefined) {
    return [targetNamed(found, choice.app)];
  }
  if (choice.all === true) {
    return listTargets(found);
  }
  const app = appTargetForFolder(found, folder);
  return app === undefined ? listTargets(found) : [app];
}

function targetNamed(found: FoundProjectLink, name: string): Target {
  const target = listTargets(found).find((candidate) => candidate.label === name);
  if (target === undefined) {
    const known = listTargets(found)
      .map((candidate) => candidate.label)
      .join(", ");
    throw new CliError(`.envy.json has no app called "${name}".`, {
      hint: `Pick one of: ${known}. Add an app with envy apps add <folder>.`,
    });
  }
  return target;
}

/** "development" for the root, "web/development" for an app, for messages. */
export function environmentLabel(target: Target, environment: { name: string }): string {
  return target.app === undefined ? environment.name : `${target.label}/${environment.name}`;
}
