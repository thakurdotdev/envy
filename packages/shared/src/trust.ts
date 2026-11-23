import {
  fromBase64Url,
  isLegacyWrappedEnvKey,
  unwrapEnvKey,
  unwrapLegacyEnvKey,
} from "@envy/crypto";

// What a client has seen from the server, kept to catch a server that lies
// later on (ADR 0013, ADR 0016). The CLI keeps it in trust.json, the web
// dashboard in browser storage; both follow the rules in this file.
//
// - Public keys of teammates and service tokens ("pins"). An Envy key never
//   changes once it is set, so a different key for the same id means someone
//   swapped it.
// - Projects this client has started trusting. The first time a client
//   works on a project it trusts the keys it sees ("trust on first use").
//   After that, a key it has not seen before is used only once the person
//   confirms it, because a hacked server could add a fake member.
// - The newest secrets version and key version of each environment. A server
//   that hands out an older version as the latest is refused.

export type KeyOwner = { kind: "user" | "token"; id: string; label: string; publicKey: string };
export type SeenVersion = { version: number; keyVersion: number };

export type TrustState = {
  publicKeys: Record<string, string>;
  environments: Record<string, SeenVersion>;
  knownProjects: string[];
};

/** Reads and saves the state. Writes replace the whole state. */
export type TrustStore = {
  read(): Promise<TrustState>;
  write(state: TrustState): Promise<void>;
  /** Shown in error messages: how to start over, for example after a restore. */
  resetHint: string;
};

/** Asks the person whether to trust keys this client has not seen before. */
export type ConfirmNewKeys = (
  owners: Array<KeyOwner & { fingerprint: string }>,
) => Promise<boolean>;

export type TrustProblem = "key-changed" | "not-confirmed" | "rolled-back" | "old-format-key";

/** A trust check failed. The message is safe to show and names no secret. */
export class TrustError extends Error {
  readonly problem: TrustProblem;
  readonly hint: string;

  constructor(problem: TrustProblem, message: string, hint: string) {
    super(message);
    this.name = "TrustError";
    this.problem = problem;
    this.hint = hint;
  }
}

export function emptyTrustState(): TrustState {
  return { publicKeys: {}, environments: {}, knownProjects: [] };
}

/** Reads a saved state, keeping only well-formed entries. */
export function parseTrustState(raw: unknown): TrustState {
  const trust = emptyTrustState();
  const record = isRecord(raw) ? raw : {};
  const publicKeys = isRecord(record["publicKeys"]) ? record["publicKeys"] : {};
  for (const [id, key] of Object.entries(publicKeys)) {
    if (typeof key === "string") {
      trust.publicKeys[id] = key;
    }
  }
  const environments = isRecord(record["environments"]) ? record["environments"] : {};
  for (const [id, seen] of Object.entries(environments)) {
    if (
      isRecord(seen) &&
      typeof seen["version"] === "number" &&
      typeof seen["keyVersion"] === "number"
    ) {
      trust.environments[id] = { version: seen["version"], keyVersion: seen["keyVersion"] };
    }
  }
  const knownProjects = record["knownProjects"];
  if (Array.isArray(knownProjects)) {
    trust.knownProjects = knownProjects.filter((id): id is string => typeof id === "string");
  }
  return trust;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pinId(owner: KeyOwner): string {
  return `${owner.kind}:${owner.id}`;
}

function keyChanged(owner: KeyOwner, store: TrustStore): TrustError {
  return new TrustError(
    "key-changed",
    `The server now shows a different public key for ${owner.label}.`,
    `Envy keys never change, so do not grant, rotate or pull anything. Check the fingerprint with ${owner.label} in person. If you are sure the new key is right, ${store.resetHint}`,
  );
}

/**
 * Refuses keys that changed since this client saw them. On a project this
 * client has never worked on, remembers every key it sees. Use it for lists
 * that are only shown; use {@link trustKeyOwners} before relying on a key.
 */
export async function checkListedKeys(
  store: TrustStore,
  projectId: string,
  owners: KeyOwner[],
): Promise<void> {
  const state = await store.read();
  for (const owner of owners) {
    const pinned = state.publicKeys[pinId(owner)];
    if (pinned !== undefined && pinned !== owner.publicKey) {
      throw keyChanged(owner, store);
    }
  }
  if (isFirstUse(state, projectId, owners)) {
    rememberKeys(state, projectId, owners);
    await store.write(state);
  }
}

/**
 * True the first time this client works on a project. A project is also
 * known when one of these keys is already pinned: files from before
 * knownProjects existed only have pins, and a client that knows one member
 * of a project should not silently trust the rest.
 */
function isFirstUse(state: TrustState, projectId: string, owners: KeyOwner[]): boolean {
  return (
    !state.knownProjects.includes(projectId) &&
    owners.every((owner) => state.publicKeys[pinId(owner)] === undefined)
  );
}

/**
 * Makes sure every key is one this client trusts before it wraps an
 * environment key for it or accepts one made by it:
 *
 * - a key that changed since it was seen is refused;
 * - on a project this client has never worked on, new keys are trusted
 *   (trust on first use);
 * - otherwise new keys are shown with their fingerprints and used only if
 *   the person confirms them.
 *
 * Your own public key is always trusted.
 */
export async function trustKeyOwners(input: {
  store: TrustStore;
  projectId: string;
  owners: KeyOwner[];
  ownPublicKey: string;
  confirm: ConfirmNewKeys;
  fingerprintOf: (publicKey: string) => Promise<string>;
}): Promise<void> {
  const { store, projectId, owners } = input;
  const state = await store.read();
  const unseen: KeyOwner[] = [];
  for (const owner of owners) {
    const pinned = state.publicKeys[pinId(owner)];
    if (pinned !== undefined && pinned !== owner.publicKey) {
      throw keyChanged(owner, store);
    }
    if (pinned === undefined && owner.publicKey !== input.ownPublicKey) {
      unseen.push(owner);
    }
  }
  const firstUse = isFirstUse(state, projectId, owners);
  if (unseen.length > 0 && !firstUse) {
    const withFingerprints = [];
    for (const owner of unseen) {
      withFingerprints.push({ ...owner, fingerprint: await input.fingerprintOf(owner.publicKey) });
    }
    if (!(await input.confirm(withFingerprints))) {
      throw new TrustError(
        "not-confirmed",
        `${unseen.map((owner) => owner.label).join(", ")} ${unseen.length === 1 ? "is" : "are"} new to this device and ${unseen.length === 1 ? "was" : "were"} not confirmed.`,
        "Compare fingerprints with each person (in person or on a call), then try again and confirm.",
      );
    }
  }
  if (unseen.length > 0 || firstUse) {
    rememberKeys(state, projectId, owners);
    await store.write(state);
  }
}

/**
 * Pins keys the person has just confirmed (a fingerprint checked during a
 * grant) or that this client made itself (a new service token). A key that
 * changed since it was pinned is still refused.
 */
export async function pinConfirmedKeys(
  store: TrustStore,
  projectId: string,
  owners: KeyOwner[],
): Promise<void> {
  const state = await store.read();
  for (const owner of owners) {
    const pinned = state.publicKeys[pinId(owner)];
    if (pinned !== undefined && pinned !== owner.publicKey) {
      throw keyChanged(owner, store);
    }
  }
  rememberKeys(state, projectId, owners);
  await store.write(state);
}

function rememberKeys(state: TrustState, projectId: string, owners: KeyOwner[]): void {
  for (const owner of owners) {
    state.publicKeys[pinId(owner)] = owner.publicKey;
  }
  if (!state.knownProjects.includes(projectId)) {
    state.knownProjects.push(projectId);
  }
}

function rolledBack(environmentName: string, what: string, store: TrustStore): TrustError {
  return new TrustError(
    "rolled-back",
    `The server sent ${environmentName} ${what} than this device has already seen.`,
    `Someone may be rolling the server back. If an admin restored it from a backup, ${store.resetHint}`,
  );
}

/** Refuses a version or key version older than one seen before. Changes nothing. */
export async function assertNotRolledBack(
  store: TrustStore,
  environment: { id: string; name: string },
  seen: SeenVersion,
): Promise<void> {
  const before = (await store.read()).environments[environment.id];
  if (before === undefined) {
    return;
  }
  if (seen.version < before.version) {
    throw rolledBack(environment.name, `version ${seen.version}, which is older`, store);
  }
  if (seen.keyVersion < before.keyVersion) {
    throw rolledBack(environment.name, `key version ${seen.keyVersion}, which is older`, store);
  }
}

/**
 * Remembers the newest version and key version seen. Pass only a key version
 * whose key was accepted: old-format keys are judged against what is
 * remembered here, so a number the server merely claimed must not count.
 */
export async function rememberVersion(
  store: TrustStore,
  environment: { id: string },
  seen: SeenVersion,
): Promise<void> {
  const state = await store.read();
  const before = state.environments[environment.id];
  if (before?.version === seen.version && before.keyVersion === seen.keyVersion) {
    return;
  }
  state.environments[environment.id] = {
    version: Math.max(seen.version, before?.version ?? 0),
    keyVersion: Math.max(seen.keyVersion, before?.keyVersion ?? 0),
  };
  await store.write(state);
}

export type WrappedKeyFromServer = {
  keyVersion: number;
  wrappedKey: string;
  /** Who made the wrapped key, as the server says. Checked against the pins. */
  sender: { userId: string; githubLogin: string; publicKey: string };
};

/**
 * Opens a wrapped environment key from the server, after checking that a
 * trusted person made it (ADR 0016):
 *
 * - format 2: the sender's key must pass {@link trustKeyOwners}, and the
 *   wrapped key must open with it, which a server cannot fake;
 * - format 1 (made before ADR 0016, sender unknown): accepted only for a key
 *   version this client has already seen, or for an environment it has never
 *   seen. A newer key in the old format is what a hacked server would make.
 */
export async function openWrappedEnvKey(input: {
  store: TrustStore;
  projectId: string;
  environment: { id: string; name: string };
  key: WrappedKeyFromServer;
  keys: { privateKey: Uint8Array; publicKey: string };
  confirm: ConfirmNewKeys;
  fingerprintOf: (publicKey: string) => Promise<string>;
}): Promise<Uint8Array> {
  const { store, environment, key } = input;
  const wrapped = await fromBase64Url(key.wrappedKey);
  if (isLegacyWrappedEnvKey(wrapped)) {
    const seen = (await store.read()).environments[environment.id];
    if (seen !== undefined && key.keyVersion > seen.keyVersion) {
      throw new TrustError(
        "old-format-key",
        `The server sent a new key for ${environment.name} in the old format, which does not say who made it.`,
        "Envy no longer makes keys in that format, so the server may have made this one. Ask an admin to check the server, then rotate the key from a trusted device.",
      );
    }
    return unwrapLegacyEnvKey(wrapped, input.keys.privateKey);
  }
  await trustKeyOwners({
    store,
    projectId: input.projectId,
    owners: [
      {
        kind: "user",
        id: key.sender.userId,
        label: `@${key.sender.githubLogin}`,
        publicKey: key.sender.publicKey,
      },
    ],
    ownPublicKey: input.keys.publicKey,
    confirm: input.confirm,
    fingerprintOf: input.fingerprintOf,
  });
  return unwrapEnvKey(wrapped, {
    recipientPrivateKey: input.keys.privateKey,
    senderPublicKey: await fromBase64Url(key.sender.publicKey),
    place: { environmentId: environment.id, keyVersion: key.keyVersion },
  });
}
