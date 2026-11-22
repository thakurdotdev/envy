import { decryptSecrets, fromBase64Url, unwrapEnvKey } from "@envy/crypto";
import { openProjectContext, type EnvironmentOptions } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { pullEnvironment, pushEnvironment } from "../core/secrets.ts";
import { setPulledVersion } from "../core/settings.ts";
import { diffKeys, formatDiff } from "../ui/diff.ts";
import { output } from "../ui/output.ts";
import { askConfirm } from "../ui/prompts.ts";

export async function history(
  options: EnvironmentOptions & { limit?: string; json?: boolean },
): Promise<void> {
  const { session, environment } = await openProjectContext(options);
  const limit = Math.min(Number(options.limit ?? "20") || 20, 100);
  const result = await session.call((api) =>
    api.v1.environments({ id: environment.id }).versions.get({ query: { limit } }),
  );
  if (options.json === true) {
    output.result(JSON.stringify(result.items, null, 2));
    return;
  }
  if (result.items.length === 0) {
    output.success(`${environment.name} has no versions yet.`);
    return;
  }
  for (const item of result.items) {
    const message = item.message === null ? "" : `  ${item.message}`;
    output.result(
      `v${String(item.version).padEnd(5)} ${formatTime(item.createdAt)}  @${item.author.githubLogin}${message}`,
    );
  }
}

/** Restores an old version by pushing its values again as the newest version. */
export async function rollback(versionText: string, options: EnvironmentOptions): Promise<void> {
  const version = Number(versionText);
  if (!Number.isInteger(version) || version < 1) {
    throw new CliError(`"${versionText}" is not a version number.`, {
      hint: "Run envy history to see them.",
    });
  }
  const context = await openProjectContext(options);
  const { found, session, environment } = context;
  const keys = await context.unlock();
  const projectId = found.link.projectId;

  const { current: old } = await session.call((api) =>
    api.v1.environments({ id: environment.id }).secrets.get({ query: { version } }),
  );
  if (old === null) {
    throw new CliError(`${environment.name} has no version ${version}.`);
  }
  const oldKey = await session.call((api) =>
    api.v1.environments({ id: environment.id }).key.get({ query: { keyVersion: old.keyVersion } }),
  );
  const oldSecrets = await decryptSecrets(
    { ciphertext: await fromBase64Url(old.ciphertext), nonce: await fromBase64Url(old.nonce) },
    await unwrapEnvKey(await fromBase64Url(oldKey.wrappedKey), keys.privateKey),
    { projectId, environmentId: environment.id, version: old.version, keyVersion: old.keyVersion },
  );

  const latest = await pullEnvironment(session, keys, projectId, environment);
  output.info(formatDiff(diffKeys(latest.secrets, oldSecrets)));
  if (options.yes !== true) {
    const confirmed = await askConfirm(
      `Make version ${version} the current ${environment.name}?`,
      "Add --yes to roll back.",
    );
    if (!confirmed) {
      throw new CliError("Stopped. Nothing was changed.");
    }
  }
  const newVersion = await pushEnvironment({
    session,
    keys,
    projectId,
    environment,
    secrets: oldSecrets,
    baseVersion: latest.version,
    message: `Rollback to version ${version}`,
  });
  await setPulledVersion(environment.id, newVersion);
  output.success(
    `Rolled ${environment.name} back to version ${version} (saved as version ${newVersion}).`,
  );
}

// Eden turns ISO date strings into Date objects at runtime even though the
// type says string, so accept both.
function formatTime(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}
