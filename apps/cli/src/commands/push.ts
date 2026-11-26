import { separateFromLayers } from "@envy/shared";
import { openTargets, type EnvironmentOptions, type TargetEnvironment } from "../core/context.ts";
import { createPullCache, loadLayeredVariables } from "../core/layered-pull.ts";
import { projectEnvFilePath, readEnvFile } from "../core/env-file.ts";
import { CliError } from "../core/errors.ts";
import { pushEnvironment, pushEnvironments } from "../core/secrets.ts";
import { getPulledVersion, setPulledVersion } from "../core/settings.ts";
import { environmentLabel, targetFileLabel, type TargetChoice } from "../core/targets.ts";
import { diffKeys, formatDiff, isEmptyDiff, type KeyDiff } from "../ui/diff.ts";
import { output } from "../ui/output.ts";
import { askConfirm } from "../ui/prompts.ts";

export type PushOptions = EnvironmentOptions & TargetChoice & { message?: string; force?: boolean };

/** One target's change, worked out before anything is sent. */
type PushPlan = TargetEnvironment & {
  label: string;
  secrets: Record<string, string>;
  diff: KeyDiff;
  remoteVersion: number;
  pulledVersion: number;
};

/**
 * Uploads each target's file as a new version of its own layer. At a
 * monorepo root that is the root and every app, saved all or nothing.
 */
export async function push(options: PushOptions): Promise<void> {
  const { project, targets } = await openTargets(options);
  const keys = await project.unlock();
  const plans = await planPushes(project, targets);
  if (plans.length === 0) {
    const only = targets.length === 1 ? targets[0] : undefined;
    output.success(
      only === undefined
        ? "Nothing to push: every environment already matches its file."
        : `Nothing to push: ${environmentLabel(only.target, only.environment)} already matches ${targetFileLabel(only.target)}.`,
    );
    return;
  }

  const stale = plans.filter((plan) => plan.pulledVersion < plan.remoteVersion);
  if (stale.length > 0) {
    await confirmOverwrite(stale, plans, options.force === true);
  } else {
    showDiffs(plans);
    await confirmPush(plans, options.yes === true);
  }

  const versions = await sendPushes(plans, {
    session: project.session,
    keys,
    projectId: project.found.link.projectId,
    ...(options.message === undefined ? {} : { message: options.message }),
  });
  for (const plan of plans) {
    const version = versions.get(plan.environment.id) ?? 0;
    await setPulledVersion(plan.environment.id, version);
    output.success(`Pushed version ${version} of ${plan.label} (${summarize(plan.diff)}).`);
  }
}

// Every change is compared with what the server had before this push, so a
// root change is never mistaken for an app override (ADR 0018).
async function planPushes(
  project: Parameters<typeof createPullCache>[0],
  targets: TargetEnvironment[],
): Promise<PushPlan[]> {
  const pullOnce = createPullCache(project);
  const plans: PushPlan[] = [];
  for (const target of targets) {
    const file = targetFileLabel(target.target);
    const local = await readEnvFile(await projectEnvFilePath(project.found, target.target));
    if (local === undefined) {
      if (targets.length === 1) {
        throw new CliError(`There is no ${file} to push.`, { hint: "Run envy pull first." });
      }
      output.info(`No ${file}, so ${target.target.label} is left as it is.`);
      continue;
    }
    const { top, lower } = await loadLayeredVariables(pullOnce, target);
    // The file holds the lower layers too (envy pull merges them in); those keys stay below.
    const secrets = separateFromLayers({ local, lower, remoteTop: top.secrets });
    const diff = diffKeys(top.secrets, secrets);
    if (isEmptyDiff(diff)) {
      continue;
    }
    plans.push({
      ...target,
      label: environmentLabel(target.target, target.environment),
      secrets,
      diff,
      remoteVersion: top.version,
      pulledVersion: (await getPulledVersion(target.environment.id)) ?? top.version,
    });
  }
  return plans;
}

async function sendPushes(
  plans: PushPlan[],
  shared: Omit<Parameters<typeof pushEnvironment>[0], "environment" | "secrets" | "baseVersion">,
): Promise<Map<string, number>> {
  try {
    const [only] = plans;
    if (plans.length === 1 && only !== undefined) {
      const version = await pushEnvironment({
        ...shared,
        environment: only.environment,
        secrets: only.secrets,
        baseVersion: only.remoteVersion,
      });
      return new Map([[only.environment.id, version]]);
    }
    return await pushEnvironments(
      plans.map((plan) => ({
        environment: plan.environment,
        secrets: plan.secrets,
        baseVersion: plan.remoteVersion,
        ...(shared.message === undefined ? {} : { message: shared.message }),
      })),
      shared,
    );
  } catch (error) {
    if (error instanceof CliError && error.apiCode === "VERSION_CONFLICT") {
      const names = plans.map((plan) => plan.label).join(", ");
      throw new CliError(`Someone pushed to ${names} at the same moment. Nothing was pushed.`, {
        hint: "Run envy pull, check the changes, then push again.",
      });
    }
    throw error;
  }
}

function showDiffs(plans: PushPlan[]): void {
  for (const plan of plans) {
    output.info(
      plans.length === 1 ? formatDiff(plan.diff) : `${plan.label}: ${formatDiff(plan.diff)}`,
    );
  }
}

async function confirmPush(plans: PushPlan[], alreadyConfirmed: boolean): Promise<void> {
  if (alreadyConfirmed) {
    return;
  }
  const names = plans.map((plan) => plan.label).join(", ");
  const confirmed = await askConfirm(`Push these changes to ${names}?`, "Add --yes to push.");
  if (!confirmed) {
    throw new CliError("Stopped. Nothing was pushed.");
  }
}

// Someone pushed after this machine last pulled. Pushing now would replace
// their version, so it needs a clear yes (or --force when nobody can answer).
async function confirmOverwrite(
  stale: PushPlan[],
  plans: PushPlan[],
  force: boolean,
): Promise<void> {
  for (const plan of stale) {
    output.warn(
      `${plan.label} is at version ${plan.remoteVersion}, but you last pulled version ${plan.pulledVersion}.`,
    );
  }
  for (const plan of plans) {
    const prefix = plans.length === 1 ? "" : `${plan.label}: `;
    output.info(`Pushing would change: ${prefix}${formatDiff(plan.diff)}`);
  }
  if (force) {
    return;
  }
  const [only] = stale;
  const question =
    stale.length === 1 && only !== undefined
      ? `Replace version ${only.remoteVersion} with your file?`
      : "Replace the newer versions with your files?";
  const confirmed = await askConfirm(
    question,
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
