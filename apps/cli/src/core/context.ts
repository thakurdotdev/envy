import { layersUnder } from "@envy/shared";
import { askConfirm } from "../ui/prompts.ts";
import { CliError } from "./errors.ts";
import { resolveEnvironment, type EnvironmentSummary } from "./environment.ts";
import { getCurrentGitBranch } from "./git.ts";
import { requireProjectLink, type FoundProjectLink } from "./project-link.ts";
import { listApps, listEnvironments } from "./secrets.ts";
import { openSession, type ApiCaller } from "./session.ts";
import { openTokenContext, readServiceToken } from "./service-token.ts";
import { chooseTarget, chooseTargets, type Target, type TargetChoice } from "./targets.ts";
import { getUnlockedKeys, type UnlockedKeys } from "./unlock.ts";

export type EnvironmentOptions = { env?: string; yes?: boolean; app?: string };

/** The linked project, signed in, with every environment (app ones too). */
export type OpenProject = {
  found: FoundProjectLink;
  session: ApiCaller;
  environments: EnvironmentSummary[];
  /** App name → the server's app id, for the apps in `.envy.json`. */
  appIds: Map<string, string>;
  unlock(): Promise<UnlockedKeys>;
  /** True when unlock() will not ask for the master password. */
  canUnlockWithoutAsking: boolean;
};

/** One target with the environment to use there and the layers under it. */
export type TargetEnvironment = {
  target: Target;
  /** The top layer: where pushes go. */
  environment: EnvironmentSummary;
  /** The layers under it, lowest first (ADR 0018). */
  layers: EnvironmentSummary[];
};

export type ProjectContext = OpenProject & TargetEnvironment;

export async function openProject(): Promise<OpenProject> {
  const found = await requireProjectLink();
  const session = await openSession();
  const environments = await listEnvironments(session, found.link.projectId);
  const appIds = await findAppIds(session, found);
  let keys: UnlockedKeys | undefined;
  return {
    found,
    session,
    environments,
    appIds,
    canUnlockWithoutAsking:
      session.credentials.privateKey !== undefined || Boolean(process.env["ENVY_MASTER_PASSWORD"]),
    async unlock() {
      keys ??= await getUnlockedKeys(session);
      return keys;
    },
  };
}

/** Everything a command needs to work on one environment of one target. */
export async function openProjectContext(options: EnvironmentOptions): Promise<ProjectContext> {
  // In CI, ENVY_TOKEN replaces signing in: it names one environment to read.
  const serviceToken = readServiceToken();
  if (serviceToken !== undefined) {
    return openTokenContext(serviceToken, options);
  }
  const project = await openProject();
  const stage = await chooseStage(project, options);
  const target = chooseTarget(project.found, options.app);
  return { ...project, ...environmentForTarget(project, target, stage) };
}

/** For `pull` and `push`: the chosen targets, each with its environment and layers. */
export async function openProjectTargets(
  options: EnvironmentOptions & TargetChoice,
): Promise<{ project: OpenProject; stage: EnvironmentSummary; targets: TargetEnvironment[] }> {
  const project = await openProject();
  const stage = await chooseStage(project, options);
  // The shared layer belongs to the project, not to an app.
  const targets = chooseTargets(project.found, options).filter(
    (target) => !stage.isShared || target.app === undefined || options.app !== undefined,
  );
  return {
    project,
    stage,
    targets: targets.map((target) => environmentForTarget(project, target, stage)),
  };
}

/**
 * The targets for `pull` and `push`. With a service token it is the one
 * environment the token reads.
 */
export async function openTargets(options: EnvironmentOptions & TargetChoice): Promise<{
  project: Pick<OpenProject, "found" | "session" | "unlock">;
  targets: TargetEnvironment[];
  stageName: string;
}> {
  if (readServiceToken() !== undefined) {
    const context = await openProjectContext(options);
    return { project: context, targets: [context], stageName: context.environment.name };
  }
  const { project, stage, targets } = await openProjectTargets(options);
  return { project, targets, stageName: stage.name };
}

/**
 * Picks the stage (a root environment) from --env, ENVY_ENV, the git branch
 * or the default, and confirms a protected one.
 */
async function chooseStage(
  project: OpenProject,
  options: EnvironmentOptions,
): Promise<EnvironmentSummary> {
  const { found } = project;
  const { environment } = resolveEnvironment({
    flag: options.env,
    environmentVariable: process.env["ENVY_ENV"],
    gitBranch: getCurrentGitBranch(found.folder),
    branches: found.link.branches,
    defaultEnvironment: found.link.defaultEnvironment,
    environments: project.environments.filter((candidate) => candidate.appId === null),
  });
  if (environment.isProtected) {
    await confirmProtectedEnvironment(environment.name, options.yes === true);
  }
  return environment;
}

/** The target's own environment for the stage, and the layers under it. */
export function environmentForTarget(
  project: Pick<OpenProject, "environments" | "appIds">,
  target: Target,
  stage: EnvironmentSummary,
): TargetEnvironment {
  if (target.app === undefined) {
    return { target, environment: stage, layers: layersUnder(stage, project.environments) };
  }
  if (stage.isShared) {
    throw new CliError(`${stage.name} is the whole project's layer, not an app's.`, {
      hint: "Leave out --app, or use --app root.",
    });
  }
  const appId = project.appIds.get(target.app);
  const environment = project.environments.find(
    (candidate) => candidate.appId === appId && candidate.name === stage.name,
  );
  if (appId === undefined || environment === undefined) {
    throw new CliError(`The app ${target.label} has no ${stage.name} environment.`, {
      hint: "Run envy apps ls to check the project's apps.",
    });
  }
  const layers = layersUnder(environment, project.environments, {
    inheritRoot: target.inheritRoot,
  });
  return { target, environment, layers };
}

// The server knows apps by id; .envy.json knows them by name.
async function findAppIds(session: ApiCaller, found: FoundProjectLink) {
  const linked = Object.keys(found.link.apps);
  if (linked.length === 0) {
    return new Map<string, string>();
  }
  const apps = await listApps(session, found.link.projectId);
  const appIds = new Map(apps.map((app) => [app.name, app.id]));
  const missing = linked.filter((name) => !appIds.has(name));
  if (missing.length > 0) {
    throw new CliError(
      `.envy.json lists ${missing.join(", ")}, but the project has no such ${missing.length === 1 ? "app" : "apps"}.`,
      { hint: "Remove it from .envy.json, or add it again with envy apps add <folder>." },
    );
  }
  return appIds;
}

async function confirmProtectedEnvironment(name: string, alreadyConfirmed: boolean): Promise<void> {
  if (alreadyConfirmed) {
    return;
  }
  const confirmed = await askConfirm(
    `"${name}" is a protected environment. Continue?`,
    `Add --yes to confirm you mean "${name}".`,
  );
  if (!confirmed) {
    throw new CliError("Stopped. Nothing was changed.");
  }
}
