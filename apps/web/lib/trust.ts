import { fingerprint, fromBase64Url, toBase64Url } from "@envy/crypto";
import {
  assertNotRolledBack,
  checkListedKeys,
  emptyTrustState,
  openWrappedEnvKey,
  parseTrustState,
  pinConfirmedKeys,
  rememberVersion,
  trustKeyOwners,
  type ConfirmNewKeys,
  type KeyOwner,
  type SeenVersion,
  type TrustState,
  type TrustStore,
  type WrappedKeyFromServer,
} from "@envy/shared";

// The dashboard side of the trust rules in packages/shared/src/trust.ts
// (ADR 0013, ADR 0016). Pins and versions seen are kept in this browser's
// storage, one entry per account. They are not secret: only public keys,
// ids and version numbers.

export type { KeyOwner };

export type WebTrust = {
  store: TrustStore;
  confirm: ConfirmNewKeys;
};

export type KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

function storageKey(userId: string): string {
  return `envy.trust.${userId}`;
}

/**
 * A store in localStorage. If the browser refuses storage (a private window,
 * blocked site data), it falls back to memory for this tab: the checks still
 * run, but a later visit starts again from trust on first use.
 */
export function browserTrustStore(userId: string): TrustStore {
  let inMemory: TrustState = emptyTrustState();
  return {
    async read() {
      try {
        const saved = window.localStorage.getItem(storageKey(userId));
        return saved === null ? structuredClone(inMemory) : parseTrustState(JSON.parse(saved));
      } catch {
        return structuredClone(inMemory);
      }
    },
    async write(state) {
      inMemory = structuredClone(state);
      try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
      } catch {
        // Kept in memory above.
      }
    },
    resetHint:
      "clear this site's data in your browser settings and try again (this forgets every key this browser has checked).",
  };
}

async function fingerprintOf(publicKey: string): Promise<string> {
  return fingerprint(await fromBase64Url(publicKey));
}

export function checkListedPublicKeys(
  trust: WebTrust,
  projectId: string,
  owners: KeyOwner[],
): Promise<void> {
  return checkListedKeys(trust.store, projectId, owners);
}

export function pinConfirmedPublicKeys(
  trust: WebTrust,
  projectId: string,
  owners: KeyOwner[],
): Promise<void> {
  return pinConfirmedKeys(trust.store, projectId, owners);
}

export async function trustRecipients(
  trust: WebTrust,
  keys: KeyPair,
  projectId: string,
  owners: KeyOwner[],
): Promise<void> {
  await trustKeyOwners({
    store: trust.store,
    projectId,
    owners,
    ownPublicKey: await toBase64Url(keys.publicKey),
    confirm: trust.confirm,
    fingerprintOf,
  });
}

export async function openTrustedEnvKey(
  trust: WebTrust,
  keys: KeyPair,
  input: {
    projectId: string;
    environment: { id: string; name: string };
    key: WrappedKeyFromServer;
  },
): Promise<Uint8Array> {
  return openWrappedEnvKey({
    store: trust.store,
    projectId: input.projectId,
    environment: input.environment,
    key: input.key,
    keys: { privateKey: keys.privateKey, publicKey: await toBase64Url(keys.publicKey) },
    confirm: trust.confirm,
    fingerprintOf,
  });
}

export function checkNotRolledBack(
  trust: WebTrust,
  environment: { id: string; name: string },
  seen: SeenVersion,
): Promise<void> {
  return assertNotRolledBack(trust.store, environment, seen);
}

export function rememberEnvironmentVersion(
  trust: WebTrust,
  environment: { id: string },
  seen: SeenVersion,
): Promise<void> {
  return rememberVersion(trust.store, environment, seen);
}

export function memberKeyOwner(member: {
  userId: string;
  githubLogin: string;
  publicKey: string | null;
}): KeyOwner[] {
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

export function tokenKeyOwner(token: { id: string; name: string; publicKey: string }): KeyOwner {
  return {
    kind: "token",
    id: token.id,
    label: `the service token "${token.name}"`,
    publicKey: token.publicKey,
  };
}
