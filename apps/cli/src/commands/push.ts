import { join } from "node:path";
import { openProjectContext, type EnvironmentOptions } from "../core/context.ts";
import { readEnvFile } from "../core/env-file.ts";
import { CliError } from "../core/errors.ts";
import { pullEnvironment, pushEnvironment, separateFromShared } from "../core/secrets.ts";
import { getPulledVersion, setPulledVersion } from "../core/settings.ts";
import { diffKeys, formatDiff, isEmptyDiff, type KeyDiff } from "../ui/diff.ts";
import { output } from "../ui/output.ts";
import { askConfirm } from "../ui/prompts.ts";

export type PushOptions = EnvironmentOptions & { message?: string; force?: boolean };

export async function push(options: PushOptions): Promise<void> {
  const context = await openProjectContext(options);
  const { found, session, environment, sharedEnvironment } = context;
  const keys = await context.unlock();
  const projectId = found.link.projectId;

  const path = join(found.folder, found.link.file);
  const local = await readEnvFile(path);
  if (local === undefined) {
    throw new CliError(`There is no ${found.link.file} to push.`, { hint: "Run envy pull first." });
  }

  const remote = await pullEnvironment(session, keys, projectId, environment);
  const shared =
    sharedEnvironment === undefined
      ? { secrets: {} }
      : await pullEnvironment(session, keys, projectId, sharedEnvironment);
  // The file holds the shared layer too (envy pull merges it in); those keys stay in shared.
  const toPush = separateFromShared({
    local,
    shared: shared.secrets,
    remoteEnvironment: remote.secrets,
  });
  const diff = diffKeys(remote.secrets, toPush);
  if (isEmptyDiff(diff)) {
    output.success(`Nothing to push: ${environment.name} already matches ${found.link.file}.`);
    return;
  }

  const pulledVersion = (await getPulledVersion(environment.id)) ?? remote.version;
  if (pulledVersion < remote.version) {
    await confirmOverwrite(
      environment.name,
      remote.version,
      pulledVersion,
      diff,
      options.force === true,
    );
  } else {
    output.info(formatDiff(diff));
    await confirmPush(environment.name, options.yes === true);
  }

  let version: number;
  try {
    version = await pushEnvironment({
      session,
      keys,
      projectId,
      environment,
      secrets: toPush,
      baseVersion: remote.version,
      ...(options.message === undefined ? {} : { message: options.message }),
    });
  } catch (error) {
    if (error instanceof CliError && error.apiCode === "VERSION_CONFLICT") {
      throw new CliError(`Someone pushed to ${environment.name} at the same moment.`, {
        hint: "Run envy pull, check the changes, then push again.",
      });
    }
    throw error;
  }
  await setPulledVersion(environment.id, version);
  output.success(`Pushed version ${version} of ${environment.name} (${summarize(diff)}).`);
}

async function confirmPush(environmentName: string, alreadyConfirmed: boolean): Promise<void> {
  if (alreadyConfirmed) {
    return;
  }
  const confirmed = await askConfirm(
    `Push these changes to ${environmentName}?`,
    "Add --yes to push.",
  );
  if (!confirmed) {
    throw new CliError("Stopped. Nothing was pushed.");
  }
}

// Someone pushed after this machine last pulled. Pushing now would replace
// their version, so it needs a clear yes (or --force when nobody can answer).
async function confirmOverwrite(
  environmentName: string,
  remoteVersion: number,
  pulledVersion: number,
  diff: KeyDiff,
  force: boolean,
): Promise<void> {
  output.warn(
    `${environmentName} is at version ${remoteVersion}, but you last pulled version ${pulledVersion}.`,
  );
  output.info(`Pushing would change: ${formatDiff(diff)}`);
  if (force) {
    return;
  }
  const confirmed = await askConfirm(
    `Replace version ${remoteVersion} with your file?`,
    "Run envy pull to get the newer version first, or add --force to replace it.",
  );
  if (!confirmed) {
    throw new CliError("Stopped. Nothing was pushed.", {
      hint: "Run envy pull to get the newer version.",
    });
  }
}

function summarize(diff: KeyDiff): string {
  return `+${diff.added.length} ~${diff.changed.length} −${diff.removed.length}`;
}
