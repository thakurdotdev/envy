import { clearKey, fingerprint, fromBase64Url } from "@envy/crypto";
import { fetchEnvKey, wrapEnvKeyFor } from "./env-keys.ts";
import { CliError } from "./errors.ts";
import { listEnvironments } from "./secrets.ts";
import type { Session } from "./session.ts";
import {
  checkListedPublicKeys,
  pinConfirmedPublicKeys,
  trustRecipients,
  type KeyOwner,
} from "./trust.ts";
import type { UnlockedKeys } from "./unlock.ts";
import { memberCanRead } from "@envy/shared";
import { buildRotation, type Rotation } from "./rotation.ts";

// Team changes that need cryptography on the admin's machine: giving a new
// member the environment keys, and rotating every key when someone leaves.

type WrappedKeyForEnvironment = { environmentId: string; keyVersion: number; wrappedKey: string };

export type Member = {
  id: string;
  userId: string;
  githubLogin: string;
  email: string;
  role: string;
  status: "pending" | "active";
  publicKey: string | null;
  /** Null: every environment. Otherwise the stages they can read (ADR 0019). */
  access: string[] | null;
};

/** The project's members. Refuses if anyone's public key changed since this machine last saw it. */
export async function listMembers(session: Session, projectId: string): Promise<Member[]> {
  const result = await session.call((api) => api.v1.projects({ id: projectId }).members.get());
  await checkListedPublicKeys(projectId, result.items.flatMap(keyOwnerOf));
  return result.items;
}

/** A member as a key owner for the trust checks, or nothing if they have no key yet. */
export function keyOwnerOf(member: Member): KeyOwner[] {
  return member.publicKey === null
    ? []
    : [
        {
          kind: "user",
          id: member.userId,
          label: `@${member.githubLogin}`,
          publicKey: member.publicKey,
        },
      ];
}

/** "@bob", "bob" or "bob@example.com" → the member. */
export function findMember(members: Member[], who: string): Member {
  const needle = who.replace(/^@/, "").toLowerCase();
  const member = members.find(
    (candidate) =>
      candidate.githubLogin.toLowerCase() === needle || candidate.email.toLowerCase() === needle,
  );
  if (member === undefined) {
    throw new CliError(`Nobody called "${who}" is in this project.`, {
      hint: "Run envy members ls.",
    });
  }
  return member;
}

export async function fingerprintOf(publicKey: string | null): Promise<string> {
  return publicKey === null ? "(no key yet)" : fingerprint(await fromBase64Url(publicKey));
}

/**
 * Wraps the key of every environment the member may read for a pending
 * member and activates them. `access` (ADR 0019) sets which stages; left
 * out, the access they already have stays.
 */
export async function grantMember(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
  member: Member,
  access?: string[] | null,
) {
  if (member.publicKey === null) {
    throw new CliError(`@${member.githubLogin} has not set up their keys yet.`, {
      hint: "Ask them to run envy login, then try again.",
    });
  }
  // The caller checked the fingerprint with the member, so their key is pinned now.
  await pinConfirmedPublicKeys(projectId, keyOwnerOf(member));
  const memberPublicKey = await fromBase64Url(member.publicKey);
  const wrappedKeys: WrappedKeyForEnvironment[] = [];
  const readable = (await listEnvironments(session, projectId)).filter((environment) =>
    memberCanRead({ access: access === undefined ? member.access : access }, environment),
  );
  for (const environment of readable) {
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
  await session.call((api) =>
    api.v1
      .members({ id: member.id })
      .grant.post({ wrappedKeys, ...(access === undefined ? {} : { access }) }),
  );
}

/**
 * Removes a member. For an active member every environment gets a new key,
 * wrapped for the people who stay, and its latest secrets are encrypted
 * again with it. The server applies the removal and all rotations together.
 */
export async function removeMember(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
  member: Member,
) {
  if (member.status === "pending") {
    return session.call((api) => api.v1.members({ id: member.id }).delete({ rotations: [] }));
  }
  const staying = (await listMembers(session, projectId)).filter(
    (candidate) => candidate.id !== member.id && candidate.status === "active",
  );
  const activeTokens = await listActiveTokens(session, projectId);
  // A hacked server could list a fake member or token; the new keys must
  // only go to keys this device trusts.
  await trustRecipients(
    projectId,
    [...staying.flatMap(keyOwnerOf), ...activeTokens.map(tokenKeyOwner)],
    keys,
  );
  const rotations: Rotation[] = [];
  // Only the environments they could read need a new key (ADR 0019).
  for (const environment of await listEnvironments(session, projectId)) {
    if (memberCanRead(member, environment)) {
      const readers = staying.filter((candidate) => memberCanRead(candidate, environment));
      rotations.push(
        await buildRotation({ session, keys, projectId, environment, readers, activeTokens }),
      );
    }
  }
  // The answer lists the service tokens this member made, which were revoked with them.
  return session.call((api) => api.v1.members({ id: member.id }).delete({ rotations }));
}

/** Service tokens that still work (not revoked, not expired). */
export async function listActiveTokens(session: Session, projectId: string) {
  const { items } = await session.call((api) => api.v1.projects({ id: projectId }).tokens.get());
  const now = Date.now();
  const active = items.filter(
    (token) =>
      token.revokedAt === null &&
      (token.expiresAt === null || new Date(token.expiresAt).getTime() > now),
  );
  await checkListedPublicKeys(projectId, active.map(tokenKeyOwner));
  return active;
}

export function tokenKeyOwner(token: { id: string; name: string; publicKey: string }): KeyOwner {
  return {
    kind: "token",
    id: token.id,
    label: `the service token "${token.name}"`,
    publicKey: token.publicKey,
  };
}
