import { clearKey, generateEnvKey } from "@envy/crypto";
import { memberCanRead, NAME_PATTERN, newUuidV7s, ROOT_APP_NAME } from "@envy/shared";
import { join } from "node:path";
import { wrapEnvKeyFor } from "./env-keys.ts";
import type { EnvironmentSummary } from "./environment.ts";
import { CliError } from "./errors.ts";
import { importEnvFiles, type ImportOptions } from "./import-files.ts";
import type { FoundProjectLink, ProjectLink } from "./project-link.ts";
import { listApps, listEnvironments } from "./secrets.ts";
import type { Session } from "./session.ts";
import { keyOwnerOf, listMembers, type Member } from "./team.ts";
import { trustRecipients } from "./trust.ts";
import type { UnlockedKeys } from "./unlock.ts";

// Making new environment keys for apps (ADR 0018). Each key is made here
// and wrapped for every active member; the server only gets wrapped keys.

const NAME = new RegExp(NAME_PATTERN);

/** The active members, after checking their keys are ones this device trusts. */
export async function trustedActiveMembers(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
): Promise<Member[]> {
  const members = (await listMembers(session, projectId)).filter(
    (member) => member.status === "active",
  );
  // A hacked server could list a fake member; new keys go only to trusted keys.
  await trustRecipients(projectId, members.flatMap(keyOwnerOf), keys);
  return members;
}

/** A new environment key with a new id, wrapped for each member. */
export type NewEnvironmentKey = {
  id: string;
  wrappedKeys: Array<{ userId: string; wrappedKey: string }>;
};

export async function newEnvironmentKey(
  keys: UnlockedKeys,
  members: Member[],
): Promise<NewEnvironmentKey> {
  // The id is chosen here so the wrapped keys can be bound to it (ADR 0016).
  const [id = ""] = newUuidV7s(1);
  const place = { environmentId: id, keyVersion: 1 };
  const envKey = await generateEnvKey();
  try {
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
    return { id, wrappedKeys };
  } finally {
    await clearKey(envKey);
  }
}

/** Creates an app with one environment for each root stage. */
export async function createApp(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
  name: string,
): Promise<{ id: string; name: string; environments: EnvironmentSummary[] }> {
  const members = await trustedActiveMembers(session, keys, projectId);
  const stages = (await listEnvironments(session, projectId)).filter(
    (environment) => environment.appId === null && !environment.isShared,
  );
  const environments: Array<NewEnvironmentKey & { name: string }> = [];
  for (const stage of stages) {
    // Only members who can read this stage get its key (ADR 0019).
    const readers = members.filter((member) => memberCanRead(member, stage));
    environments.push({ name: stage.name, ...(await newEnvironmentKey(keys, readers)) });
  }
  return session.call((api) =>
    api.v1.projects({ id: projectId }).apps.post({ name, environments }),
  );
}

/** An app name from a folder: "apps/Web App" → "web-app". */
export function appNameFromFolder(path: string): string {
  const last = path.split(/[\\/]/).findLast((part) => part !== "") ?? "";
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type AddAppInput = {
  session: Session;
  keys: UnlockedKeys;
  found: FoundProjectLink;
  /** The app's folder, relative to the repo root. */
  path: string;
  name: string;
  file?: string | undefined;
  inheritRoot?: boolean | undefined;
  importOptions: ImportOptions;
};

/**
 * Adds an app to `.envy.json`: creates it in the project (or links the one
 * that already has this name) and offers to import its folder's .env files.
 * Returns the new link; the caller writes it.
 */
export async function addApp(input: AddAppInput) {
  const { session, keys, found, path, name } = input;
  const projectId = found.link.projectId;
  if (!NAME.test(name) || name === ROOT_APP_NAME) {
    throw new CliError(`"${name}" cannot be an app name.`, {
      hint: "Use lower case letters, digits, - and _, for example --name web.",
    });
  }
  if (Object.hasOwn(found.link.apps, name)) {
    throw new CliError(`.envy.json already has an app called ${name}.`, {
      hint: "Pick another name with --name.",
    });
  }
  const existing = (await listApps(session, projectId)).find((app) => app.name === name);
  const app = existing ?? (await createApp(session, keys, projectId, name));
  const environments = (await listEnvironments(session, projectId)).filter(
    (environment) => environment.appId === app.id,
  );
  const imported = await importEnvFiles(
    session,
    keys,
    projectId,
    environments,
    {
      folder: join(found.folder, path),
      fileLabelPrefix: `${path}/`,
      environmentLabelPrefix: `${name}/`,
    },
    input.importOptions,
  );
  const link: ProjectLink = {
    ...found.link,
    apps: {
      ...found.link.apps,
      [name]: { path, file: input.file ?? ".env", inheritRoot: input.inheritRoot ?? true },
    },
  };
  return { link, created: existing === undefined, imported };
}
