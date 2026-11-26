import { newEnvironmentKey, trustedActiveMembers, type NewEnvironmentKey } from "../core/apps.ts";
import { requireProjectLink } from "../core/project-link.ts";
import { listApps, listEnvironments } from "../core/secrets.ts";
import { openSession } from "../core/session.ts";
import { getUnlockedKeys } from "../core/unlock.ts";
import { output } from "../ui/output.ts";

export async function listProjectEnvironments(options: { json?: boolean }): Promise<void> {
  const found = await requireProjectLink();
  // The stages; every app has the same ones (envy apps ls lists the apps).
  const environments = (await listEnvironments(await openSession(), found.link.projectId)).filter(
    (environment) => environment.appId === null,
  );
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

/**
 * Adds a stage: a root environment, and the same stage for every app of the
 * project in the same request (ADR 0018). Each key is new and wrapped here
 * for every active member.
 */
export async function addEnvironment(
  name: string,
  options: { protected?: boolean },
): Promise<void> {
  const found = await requireProjectLink();
  const projectId = found.link.projectId;
  const session = await openSession();
  const keys = await getUnlockedKeys(session);
  const members = await trustedActiveMembers(session, keys, projectId);
  const root = await newEnvironmentKey(keys, members);
  const appEnvironments: Array<NewEnvironmentKey & { appId: string }> = [];
  for (const app of await listApps(session, projectId)) {
    appEnvironments.push({ appId: app.id, ...(await newEnvironmentKey(keys, members)) });
  }
  await session.call((api) =>
    api.v1.projects({ id: projectId }).environments.post({
      id: root.id,
      name,
      isProtected: options.protected === true,
      wrappedKeys: root.wrappedKeys,
      ...(appEnvironments.length === 0 ? {} : { appEnvironments }),
    }),
  );
  const forApps =
    appEnvironments.length === 0
      ? ""
      : ` for the root and ${appEnvironments.length} ${appEnvironments.length === 1 ? "app" : "apps"}`;
  output.success(
    `Added ${name}${options.protected === true ? " (protected)" : ""}${forApps}. Push to it with envy push --env ${name}.`,
  );
}
