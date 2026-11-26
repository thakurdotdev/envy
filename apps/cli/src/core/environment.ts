import { CliError } from "./errors.ts";

export type EnvironmentSummary = {
  id: string;
  /** Null for the project's own (root) environments. */
  appId: string | null;
  name: string;
  isShared: boolean;
  isProtected: boolean;
  currentKeyVersion: number;
  latestVersion: number;
};

export type EnvironmentChoice = {
  environment: EnvironmentSummary;
  /** Where the choice came from, for messages. */
  source: "--env" | "ENVY_ENV" | "branch" | "default";
};

/**
 * Picks the environment, in this order: --env, ENVY_ENV, the `branches`
 * entry for the current git branch, then `defaultEnvironment`. A protected
 * environment (production) is never picked automatically; it needs --env.
 */
export function resolveEnvironment(input: {
  flag: string | undefined;
  environmentVariable: string | undefined;
  gitBranch: string | undefined;
  branches: Record<string, string>;
  defaultEnvironment: string;
  environments: EnvironmentSummary[];
}): EnvironmentChoice {
  const branchEnvironment =
    input.gitBranch === undefined ? undefined : input.branches[input.gitBranch];
  const candidates: Array<[string | undefined, EnvironmentChoice["source"]]> = [
    [input.flag, "--env"],
    [input.environmentVariable || undefined, "ENVY_ENV"],
    [branchEnvironment, "branch"],
    [input.defaultEnvironment, "default"],
  ];
  const [name, source] = candidates.find(([candidate]) => candidate !== undefined) ?? [
    input.defaultEnvironment,
    "default",
  ];

  const environment = input.environments.find((candidate) => candidate.name === name);
  if (environment === undefined) {
    const known = input.environments.map((candidate) => candidate.name).join(", ");
    throw new CliError(`This project has no environment called "${name ?? ""}".`, {
      hint: `Pick one of: ${known}.`,
    });
  }
  if (environment.isProtected && source !== "--env") {
    throw new CliError(`"${environment.name}" is protected, so it is never picked automatically.`, {
      hint: `Pass --env ${environment.name} to use it on purpose.`,
    });
  }
  return { environment, source };
}
