import { openProjectContext, type EnvironmentOptions } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { mergeLayers, pullEnvironment, pushEnvironment } from "../core/secrets.ts";
import { setPulledVersion } from "../core/settings.ts";
import { output } from "../ui/output.ts";
import { askPassword } from "../ui/prompts.ts";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

function assertKeyName(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new CliError(`"${key}" is not a valid variable name.`, {
      hint: "Use letters, digits and _ (it must not start with a digit).",
    });
  }
}

/**
 * `envy set KEY=value` or `envy set KEY` (asks for the value without showing
 * it, which also keeps it out of the shell history).
 */
export async function setVariables(
  assignments: string[],
  options: EnvironmentOptions,
): Promise<void> {
  const changes: Record<string, string> = {};
  for (const assignment of assignments) {
    const equalsIndex = assignment.indexOf("=");
    const key = equalsIndex === -1 ? assignment : assignment.slice(0, equalsIndex);
    assertKeyName(key);
    changes[key] =
      equalsIndex === -1
        ? await askPassword(`Value for ${key}`, `Write it as ${key}=value.`)
        : assignment.slice(equalsIndex + 1);
  }
  await changeEnvironment(
    options,
    (current) => ({ ...current, ...changes }),
    (name, version) => {
      const count = Object.keys(changes).length;
      return `Set ${count} ${count === 1 ? "variable" : "variables"} in ${name} (version ${version}).`;
    },
  );
}

export async function unsetVariables(keys: string[], options: EnvironmentOptions): Promise<void> {
  for (const key of keys) {
    assertKeyName(key);
  }
  await changeEnvironment(
    options,
    (current) => {
      const missing = keys.filter((key) => !Object.hasOwn(current, key));
      if (missing.length === keys.length) {
        throw new CliError(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`);
      }
      return Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key)));
    },
    (name, version) => `Removed ${keys.join(", ")} from ${name} (version ${version}).`,
  );
}

/** Prints one value, the only command that shows a value. Includes the shared layer. */
export async function getVariable(key: string, options: EnvironmentOptions): Promise<void> {
  const context = await openProjectContext(options);
  const { found, session, environment, sharedEnvironment } = context;
  const keys = await context.unlock();
  const pulled = await pullEnvironment(session, keys, found.link.projectId, environment);
  const shared =
    sharedEnvironment === undefined
      ? { secrets: {} }
      : await pullEnvironment(session, keys, found.link.projectId, sharedEnvironment);
  const merged = mergeLayers(shared.secrets, pulled.secrets);
  const value = merged[key];
  if (value === undefined) {
    throw new CliError(`${key} is not set in ${environment.name}.`, {
      hint: `Set it with envy set ${key}=value.`,
    });
  }
  output.result(value);
}

async function changeEnvironment(
  options: EnvironmentOptions,
  change: (current: Record<string, string>) => Record<string, string>,
  describe: (environmentName: string, version: number) => string,
): Promise<void> {
  const context = await openProjectContext(options);
  const { found, session, environment } = context;
  const keys = await context.unlock();
  const remote = await pullEnvironment(session, keys, found.link.projectId, environment);
  const version = await pushEnvironment({
    session,
    keys,
    projectId: found.link.projectId,
    environment,
    secrets: change(remote.secrets),
    baseVersion: remote.version,
  });
  await setPulledVersion(environment.id, version);
  output.success(describe(environment.name, version));
}
