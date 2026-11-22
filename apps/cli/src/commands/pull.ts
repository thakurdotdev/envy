import { join } from "node:path";
import { openProjectContext, type EnvironmentOptions } from "../core/context.ts";
import { readEnvFile, writeEnvFile } from "../core/env-file.ts";
import { mergeLayers, pullEnvironment } from "../core/secrets.ts";
import { setPulledVersion } from "../core/settings.ts";
import { warnAboutMissingKeys } from "../core/example-check.ts";
import { diffKeys, formatDiff, isEmptyDiff } from "../ui/diff.ts";
import { output } from "../ui/output.ts";
import { withSpinner } from "../ui/prompts.ts";

export async function pull(options: EnvironmentOptions): Promise<void> {
  const context = await openProjectContext(options);
  const { found, session, environment, sharedEnvironment } = context;
  const keys = await context.unlock();
  const projectId = found.link.projectId;

  const { merged, version } = await withSpinner(`Pulling ${environment.name}`, async () => {
    const pulled = await pullEnvironment(session, keys, projectId, environment);
    const shared =
      sharedEnvironment === undefined
        ? { secrets: {} }
        : await pullEnvironment(session, keys, projectId, sharedEnvironment);
    return { merged: mergeLayers(shared.secrets, pulled.secrets), version: pulled.version };
  });

  const path = join(found.folder, found.link.file);
  const before = (await readEnvFile(path)) ?? {};
  await writeEnvFile(path, merged);
  await setPulledVersion(environment.id, version);

  await warnAboutMissingKeys(found.folder, environment.name, merged);
  const diff = diffKeys(before, merged);
  if (!isEmptyDiff(diff)) {
    output.info(formatDiff(diff));
  }
  const count = Object.keys(merged).length;
  output.success(
    `Pulled ${count} ${count === 1 ? "variable" : "variables"} from ${environment.name} → ${found.link.file}`,
  );
}
