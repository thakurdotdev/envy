import { openTargets, type EnvironmentOptions } from "../core/context.ts";
import { createPullCache, loadLayeredVariables } from "../core/layered-pull.ts";
import { projectEnvFilePath, readEnvFile, writeEnvFile } from "../core/env-file.ts";
import { warnAboutMissingKeys } from "../core/example-check.ts";
import { setPulledVersion } from "../core/settings.ts";
import { environmentLabel, targetFileLabel, type TargetChoice } from "../core/targets.ts";
import { diffKeys, formatDiff, isEmptyDiff } from "../ui/diff.ts";
import { output } from "../ui/output.ts";
import { withSpinner } from "../ui/prompts.ts";

export type PullOptions = EnvironmentOptions & TargetChoice;

/**
 * Writes each target's file: the layers under its environment merged with
 * the environment itself. At a monorepo root that is the root and every app.
 */
export async function pull(options: PullOptions): Promise<void> {
  const { project, targets, stageName } = await openTargets(options);
  await project.unlock();
  const pullOnce = createPullCache(project);
  const loaded = await withSpinner(`Pulling ${stageName}`, () =>
    Promise.all(targets.map((target) => loadLayeredVariables(pullOnce, target))),
  );
  // Check every path before writing anything, so a bad one changes no file.
  const paths = await Promise.all(
    targets.map((target) => projectEnvFilePath(project.found, target.target)),
  );
  for (const [index, target] of targets.entries()) {
    const variables = loaded[index];
    const path = paths[index];
    if (variables === undefined || path === undefined) {
      continue;
    }
    const before = (await readEnvFile(path)) ?? {};
    await writeEnvFile(path, variables.merged);
    await setPulledVersion(target.environment.id, variables.top.version);
    const label = environmentLabel(target.target, target.environment);
    await warnAboutMissingKeys(target.target.folder, label, variables.merged);
    const diff = diffKeys(before, variables.merged);
    if (!isEmptyDiff(diff)) {
      output.info(formatDiff(diff));
    }
    const count = Object.keys(variables.merged).length;
    output.success(
      `Pulled ${count} ${count === 1 ? "variable" : "variables"} from ${label} → ${targetFileLabel(target.target)}`,
    );
  }
}
