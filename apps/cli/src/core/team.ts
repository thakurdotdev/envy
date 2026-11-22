import {
  clearKey,
  encryptSecrets,
  fingerprint,
  fromBase64Url,
  generateEnvKey,
  toBase64Url,
  unwrapEnvKey,
  wrapEnvKey,
} from "@envy/crypto";
import { CliError } from "./errors.ts";
import { listEnvironments, pullEnvironment } from "./secrets.ts";
import type { Session } from "./session.ts";
import { checkPublicKeys } from "./trust.ts";
import type { UnlockedKeys } from "./unlock.ts";

// Team changes that need cryptography on the admin's machine: giving a new
// member the environment keys, and rotating every key when someone leaves.

type WrappedKeyForEnvironment = { environmentId: string; keyVersion: number; wrappedKey: string };
type WrappedKeyForUser = { userId: string; wrappedKey: string };
type Rotation = {
  environmentId: string;
  newKeyVersion: number;
  wrappedKeys: WrappedKeyForUser[];
  tokenWrappedKeys: Array<{ tokenId: string; wrappedKey: string }>;
  baseVersion: number;
  ciphertext?: string;
  nonce?: string;
};

export type Member = {
  id: string;
  userId: string;
  githubLogin: string;
  email: string;
  role: string;
  status: "pending" | "active";
  publicKey: string | null;
};

/** The project's members. Refuses if anyone's public key changed since this machine last saw it. */
export async function listMembers(session: Session, projectId: string): Promise<Member[]> {
  const result = await session.call((api) => api.v1.projects({ id: projectId }).members.get());
  await checkPublicKeys(
    result.items.flatMap((member) =>
      member.publicKey === null
        ? []
        : [
            {
              kind: "user" as const,
              id: member.userId,
              label: `@${member.githubLogin}`,
              publicKey: member.publicKey,
            },
          ],
    ),
  );
  return result.items;
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

async function getOwnEnvKey(
  session: Session,
  keys: UnlockedKeys,
  environmentId: string,
  keyVersion: number,
) {
  const result = await session.call((api) =>
    api.v1.environments({ id: environmentId }).key.get({ query: { keyVersion } }),
  );
  return unwrapEnvKey(await fromBase64Url(result.wrappedKey), keys.privateKey);
}

/** Wraps every environment key for a pending member and activates them. */
export async function grantMember(
  session: Session,
  keys: UnlockedKeys,
  projectId: string,
  member: Member,
) {
  if (member.publicKey === null) {
    throw new CliError(`@${member.githubLogin} has not set up their keys yet.`, {
      hint: "Ask them to run envy login, then try again.",
    });
  }
  const memberPublicKey = await fromBase64Url(member.publicKey);
  const wrappedKeys: WrappedKeyForEnvironment[] = [];
  for (const environment of await listEnvironments(session, projectId)) {
    const envKey = await getOwnEnvKey(session, keys, environment.id, environment.currentKeyVersion);
    wrappedKeys.push({
      environmentId: environment.id,
      keyVersion: environment.currentKeyVersion,
      wrappedKey: await toBase64Url(await wrapEnvKey(envKey, memberPublicKey)),
    });
    await clearKey(envKey);
  }
  await session.call((api) => api.v1.members({ id: member.id }).grant.post({ wrappedKeys }));
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
  const rotations: Rotation[] = [];
  for (const environment of await listEnvironments(session, projectId)) {
    const newKeyVersion = environment.currentKeyVersion + 1;
    const newEnvKey = await generateEnvKey();
    const wrappedKeys: WrappedKeyForUser[] = [];
    for (const recipient of staying) {
      if (recipient.publicKey === null) {
        continue;
      }
      wrappedKeys.push({
        userId: recipient.userId,
        wrappedKey: await toBase64Url(
          await wrapEnvKey(newEnvKey, await fromBase64Url(recipient.publicKey)),
        ),
      });
    }
    // Service tokens for this environment get the new key too, so CI keeps working.
    const tokenWrappedKeys: Rotation["tokenWrappedKeys"] = [];
    for (const token of activeTokens.filter(
      (candidate) => candidate.environmentId === environment.id,
    )) {
      tokenWrappedKeys.push({
        tokenId: token.id,
        wrappedKey: await toBase64Url(
          await wrapEnvKey(newEnvKey, await fromBase64Url(token.publicKey)),
        ),
      });
    }
    const latest = await pullEnvironment(session, keys, projectId, environment);
    const rotation: Rotation = {
      environmentId: environment.id,
      newKeyVersion,
      wrappedKeys,
      tokenWrappedKeys,
      baseVersion: latest.version,
    };
    if (latest.version === 0) {
      rotations.push(rotation);
    } else {
      const encrypted = await encryptSecrets(latest.secrets, newEnvKey, {
        projectId,
        environmentId: environment.id,
        version: latest.version + 1,
        keyVersion: newKeyVersion,
      });
      rotations.push({
        ...rotation,
        ciphertext: await toBase64Url(encrypted.ciphertext),
        nonce: await toBase64Url(encrypted.nonce),
      });
    }
    await clearKey(newEnvKey);
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
  await checkPublicKeys(
    active.map((token) => ({
      kind: "token" as const,
      id: token.id,
      label: `the service token "${token.name}"`,
      publicKey: token.publicKey,
    })),
  );
  return active;
}
