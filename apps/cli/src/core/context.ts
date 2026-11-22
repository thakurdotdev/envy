import { askConfirm } from "../ui/prompts.ts";
import { CliError } from "./errors.ts";
import { resolveEnvironment, type EnvironmentSummary } from "./environment.ts";
import { getCurrentGitBranch } from "./git.ts";
import { requireProjectLink, type FoundProjectLink } from "./project-link.ts";
import { listEnvironments } from "./secrets.ts";
import { openSession, type ApiCaller } from "./session.ts";
import { openTokenContext, readServiceToken } from "./service-token.ts";
import { getUnlockedKeys, type UnlockedKeys } from "./unlock.ts";

export type EnvironmentOptions = { env?: string; yes?: boolean };

export type ProjectContext = {
  found: FoundProjectLink;
  session: ApiCaller;
  environments: EnvironmentSummary[];
  environment: EnvironmentSummary;
  /** The shared layer, unless the chosen environment is the shared one. */
  sharedEnvironment: EnvironmentSummary | undefined;
  unlock(): Promise<UnlockedKeys>;
};

/** Everything a command needs to work on one environment of the linked project. */
export async function openProjectContext(options: EnvironmentOptions): Promise<ProjectContext> {
  // In CI, ENVY_TOKEN replaces signing in: it names one environment to read.
  const serviceToken = readServiceToken();
  if (serviceToken !== undefined) {
    return openTokenContext(serviceToken, options.env);
  }
  const found = await requireProjectLink();
  const session = await openSession();
  const environments = await listEnvironments(session, found.link.projectId);
  const { environment } = resolveEnvironment({
    flag: options.env,
    environmentVariable: process.env["ENVY_ENV"],
    gitBranch: getCurrentGitBranch(found.folder),
    branches: found.link.branches,
    defaultEnvironment: found.link.defaultEnvironment,
    environments,
  });
  if (environment.isProtected) {
    await confirmProtectedEnvironment(environment.name, options.yes === true);
  }
  const sharedEnvironment = environment.isShared
    ? undefined
    : environments.find((candidate) => candidate.isShared);

  let keys: UnlockedKeys | undefined;
  return {
    found,
    session,
    environments,
    environment,
    sharedEnvironment,
    async unlock() {
      keys ??= await getUnlockedKeys(session);
      return keys;
    },
  };
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
