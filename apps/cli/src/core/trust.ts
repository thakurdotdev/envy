import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "./errors.ts";
import { getConfigDir } from "./paths.ts";
import { writeFileSafely } from "./settings.ts";

// What this machine has seen from the server, kept to catch a server that
// lies later on (trust.json in the config folder):
//
// - Public keys of teammates and service tokens. An Envy key never changes
//   once it is set, so a different key for the same id means someone swapped
//   it, and wrapping an environment key for it would hand the secrets over.
//   The first time a key is seen it is simply remembered ("trust on first
//   use"); comparing fingerprints in person covers that first time.
// - The newest secrets version and key version of each environment. A
//   server that hands out an older version as the latest, or asks for new
//   secrets to be encrypted with an older key, is refused.

type Trust = {
  publicKeys: Record<string, string>;
  environments: Record<string, { version: number; keyVersion: number }>;
};

function trustFilePath(): string {
  return join(getConfigDir(), "trust.json");
}

async function readTrust(): Promise<Trust> {
  const trust: Trust = { publicKeys: {}, environments: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(trustFilePath(), "utf8"));
  } catch {
    return trust;
  }
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
  return trust;
}

async function writeTrust(trust: Trust): Promise<void> {
  await writeFileSafely(trustFilePath(), `${JSON.stringify(trust, null, 2)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type KeyOwner = { kind: "user" | "token"; id: string; label: string; publicKey: string };

/**
 * Remembers each public key the first time it is seen, and refuses one that
 * changed since. Call it before wrapping anything for these keys.
 */
export async function checkPublicKeys(owners: KeyOwner[]): Promise<void> {
  const trust = await readTrust();
  let changed = false;
  for (const owner of owners) {
    const pinId = `${owner.kind}:${owner.id}`;
    const known = trust.publicKeys[pinId];
    if (known === undefined) {
      trust.publicKeys[pinId] = owner.publicKey;
      changed = true;
    } else if (known !== owner.publicKey) {
      throw new CliError(`The server now shows a different public key for ${owner.label}.`, {
        hint: `Envy keys never change, so do not grant or rotate anything. Check the fingerprint with ${owner.label} in person. If you are sure the new key is right, delete ${trustFilePath()} and try again.`,
      });
    }
  }
  if (changed) {
    await writeTrust(trust);
  }
}

function rolledBack(environmentName: string, what: string): CliError {
  return new CliError(
    `The server sent ${environmentName} ${what} than this machine has already seen.`,
    {
      hint: `Someone may be rolling the server back. If an admin restored it from a backup, delete ${trustFilePath()} and try again.`,
    },
  );
}

/** Refuses a version or key version older than one seen before, then remembers the newest. */
export async function checkEnvironmentVersion(
  environment: { id: string; name: string },
  seen: { version: number; keyVersion: number },
): Promise<void> {
  const trust = await readTrust();
  const before = trust.environments[environment.id];
  if (before !== undefined) {
    if (seen.version < before.version) {
      throw rolledBack(environment.name, `version ${seen.version}, which is older`);
    }
    if (seen.keyVersion < before.keyVersion) {
      throw rolledBack(environment.name, `key version ${seen.keyVersion}, which is older`);
    }
    if (seen.version === before.version && seen.keyVersion === before.keyVersion) {
      return;
    }
  }
  trust.environments[environment.id] = {
    version: Math.max(seen.version, before?.version ?? 0),
    keyVersion: Math.max(seen.keyVersion, before?.keyVersion ?? 0),
  };
  await writeTrust(trust);
}
