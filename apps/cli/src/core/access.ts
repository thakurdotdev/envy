import { clearKey, fromBase64Url } from "@envy/crypto";
import { memberCanRead } from "@envy/shared";
import { fetchEnvKey, wrapEnvKeyFor } from "./env-keys.ts";
import { CliError } from "./errors.ts";
import { buildRotation, type Rotation } from "./rotation.ts";
import { listEnvironments } from "./secrets.ts";
import type { Session } from "./session.ts";
import { keyOwnerOf, listActiveTokens, listMembers, tokenKeyOwner, type Member } from "./team.ts";
import { trustRecipients } from "./trust.ts";
import type { UnlockedKeys } from "./unlock.ts";

// Changing which environments a member can read (ADR 0019). Keys for what
// they gain are wrapped here; what they lose gets a new key, wrapped here
// for everyone who keeps it, so their old key opens nothing new.

/** "development,staging" → ["development", "staging"]; "all" → null. */
export function parseAccess(text: string): string[] | null {
  if (text.trim().toLowerCase() === "all") {
    return null;
  }
  const names = text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names.length === 0) {
    throw new CliError("Name at least one stage, or all.", {
      hint: "For example: development,staging",
    });
  }
  return names;
}

export function describeAccess(access: string[] | null): string {
  return access === null ? "every environment" : `shared, ${access.join(", ")}`;
}

export async function changeMemberAccess(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
  member: Member,
  access: string[] | null,
): Promise<{ gained: number; lost: number }> {
  if (member.publicKey === null) {
    throw new CliError(`@${member.githubLogin} has not set up their keys yet.`);
  }
  const environments = await listEnvironments(session, projectId);
  const isActive = member.status === "active";
  const before = environments.filter(
    (environment) => isActive && memberCanRead(member, environment),
  );
  const after = environments.filter(
    (environment) => isActive && memberCanRead({ access }, environment),
  );
  const gained = after.filter((environment) => !before.includes(environment));
  const lost = before.filter((environment) => !after.includes(environment));

  const memberPublicKey = await fromBase64Url(member.publicKey);
  const wrappedKeys: Array<{ environmentId: string; keyVersion: number; wrappedKey: string }> = [];
  for (const environment of gained) {
    const keyVersion = environment.currentKeyVersion;
    const envKey = await fetchEnvKey({ session, keys, projectId, environment, keyVersion });
    wrappedKeys.push({
      environmentId: environment.id,
      keyVersion,
      wrappedKey: await wrapEnvKeyFor(envKey, keys, memberPublicKey, {
        environmentId: environment.id,
        keyVersion,
      }),
    });
    await clearKey(envKey);
  }

  const rotations: Rotation[] = [];
  if (lost.length > 0) {
    const others = (await listMembers(session, projectId)).filter(
      (candidate) => candidate.id !== member.id && candidate.status === "active",
    );
    const activeTokens = await listActiveTokens(session, projectId);
    // New keys go only to keys this device trusts.
    await trustRecipients(
      projectId,
      [...others.flatMap(keyOwnerOf), ...activeTokens.map(tokenKeyOwner)],
      keys,
    );
    for (const environment of lost) {
      const readers = others.filter((candidate) => memberCanRead(candidate, environment));
      rotations.push(
        await buildRotation({ session, keys, projectId, environment, readers, activeTokens }),
      );
    }
  }
  await session.call((api) =>
    api.v1.members({ id: member.id }).access.put({ access, wrappedKeys, rotations }),
  );
  return { gained: gained.length, lost: lost.length };
}
