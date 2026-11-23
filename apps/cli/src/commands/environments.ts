import { clearKey, generateEnvKey } from "@envy/crypto";
import { newUuidV7s } from "@envy/shared";
import { wrapEnvKeyFor } from "../core/env-keys.ts";
import { CliError } from "../core/errors.ts";
import { requireProjectLink } from "../core/project-link.ts";
import { listEnvironments } from "../core/secrets.ts";
import { openSession } from "../core/session.ts";
import { keyOwnerOf, listMembers } from "../core/team.ts";
import { trustRecipients } from "../core/trust.ts";
import { getUnlockedKeys } from "../core/unlock.ts";
import { output } from "../ui/output.ts";

export async function listProjectEnvironments(options: { json?: boolean }): Promise<void> {
  const found = await requireProjectLink();
  const environments = await listEnvironments(await openSession(), found.link.projectId);
  if (options.json === true) {
    output.result(JSON.stringify(environments, null, 2));
    return;
  }
  for (const environment of environments) {
    const tags = [
      environment.name === found.link.defaultEnvironment ? "default" : "",
      environment.isShared ? "shared layer" : "",
      environment.isProtected ? "protected" : "",
    ].filter((tag) => tag !== "");
    output.result(
      `${environment.name.padEnd(16)} v${String(environment.latestVersion).padEnd(5)} ${tags.join(", ")}`,
    );
  }
}

/** Adds an environment with a new key, wrapped here for every active member. */
export async function addEnvironment(
  name: string,
  options: { protected?: boolean },
): Promise<void> {
  const found = await requireProjectLink();
  const projectId = found.link.projectId;
  const session = await openSession();
  const members = (await listMembers(session, projectId)).filter(
    (member) => member.status === "active",
  );
  const keys = await getUnlockedKeys(session);
  // A hacked server could list a fake member; the new key goes only to trusted keys.
  await trustRecipients(projectId, members.flatMap(keyOwnerOf), keys);
  // The id is chosen here so the wrapped keys can be bound to it (ADR 0016).
  const [environmentId = ""] = newUuidV7s(1);
  const place = { environmentId, keyVersion: 1 };
  const envKey = await generateEnvKey();
  const wrappedKeys: Array<{ userId: string; wrappedKey: string }> = [];
  for (const member of members) {
    if (member.publicKey === null) {
      throw new CliError(`@${member.githubLogin} has no key yet.`);
    }
    wrappedKeys.push({
      userId: member.userId,
      wrappedKey: await wrapEnvKeyFor(envKey, keys, member.publicKey, place),
    });
  }
  await clearKey(envKey);
  await session.call((api) =>
    api.v1.projects({ id: projectId }).environments.post({
      id: environmentId,
      name,
      isProtected: options.protected === true,
      wrappedKeys,
    }),
  );
  output.success(
    `Added ${name}${options.protected === true ? " (protected)" : ""}. Push to it with envy push --env ${name}.`,
  );
}
