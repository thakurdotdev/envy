import { clearKey, encryptSecrets, generateEnvKey, toBase64Url } from "@envy/crypto";
import { wrapEnvKeyFor } from "./env-keys.ts";
import type { EnvironmentSummary } from "./environment.ts";
import { pullEnvironment } from "./secrets.ts";
import type { Session } from "./session.ts";
import type { listActiveTokens, Member } from "./team.ts";
import type { UnlockedKeys } from "./unlock.ts";

// A key rotation made on this machine: when a member leaves, or loses
// access to an environment (ADR 0019).

type WrappedKeyForUser = { userId: string; wrappedKey: string };

export type Rotation = {
  environmentId: string;
  newKeyVersion: number;
  wrappedKeys: WrappedKeyForUser[];
  tokenWrappedKeys: Array<{ tokenId: string; wrappedKey: string }>;
  baseVersion: number;
  ciphertext?: string;
  nonce?: string;
};

/**
 * A new key for one environment: wrapped for `readers` and for every active
 * token that reads it (as its own or as a layer, ADR 0018), with the latest
 * secrets encrypted again under it.
 */
export async function buildRotation(input: {
  session: Session;
  keys: UnlockedKeys;
  projectId: string;
  environment: EnvironmentSummary;
  readers: Member[];
  activeTokens: Awaited<ReturnType<typeof listActiveTokens>>;
}): Promise<Rotation> {
  const { session, keys, projectId, environment } = input;
  const newKeyVersion = environment.currentKeyVersion + 1;
  const newEnvKey = await generateEnvKey();
  const place = { environmentId: environment.id, keyVersion: newKeyVersion };
  try {
    const wrappedKeys: WrappedKeyForUser[] = [];
    for (const recipient of input.readers) {
      if (recipient.publicKey !== null) {
        wrappedKeys.push({
          userId: recipient.userId,
          wrappedKey: await wrapEnvKeyFor(newEnvKey, keys, recipient.publicKey, place),
        });
      }
    }
    const tokenWrappedKeys: Rotation["tokenWrappedKeys"] = [];
    for (const token of input.activeTokens.filter(
      (candidate) =>
        candidate.environmentId === environment.id ||
        candidate.layerEnvironmentIds.includes(environment.id),
    )) {
      tokenWrappedKeys.push({
        tokenId: token.id,
        wrappedKey: await wrapEnvKeyFor(newEnvKey, keys, token.publicKey, place),
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
      return rotation;
    }
    const encrypted = await encryptSecrets(latest.secrets, newEnvKey, {
      projectId,
      environmentId: environment.id,
      version: latest.version + 1,
      keyVersion: newKeyVersion,
    });
    return {
      ...rotation,
      ciphertext: await toBase64Url(encrypted.ciphertext),
      nonce: await toBase64Url(encrypted.nonce),
    };
  } finally {
    await clearKey(newEnvKey);
  }
}
