import { fingerprint, fromBase64Url, toBase64Url } from "@envy/crypto";
import {
  assertNotRolledBack,
  checkListedKeys,
  openWrappedEnvKey,
  parseTrustState,
  pinConfirmedKeys,
  rememberVersion,
  trustKeyOwners,
  TrustError,
  type ConfirmNewKeys,
  type KeyOwner,
  type SeenVersion,
  type TrustState,
  type TrustStore,
  type WrappedKeyFromServer,
} from "@envy/shared";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { output } from "../ui/output.ts";
import { askConfirm } from "../ui/prompts.ts";
import { CliError } from "./errors.ts";
import { getConfigDir } from "./paths.ts";
import { readServiceToken } from "./service-token.ts";
import { writeFileSafely } from "./settings.ts";
import type { UnlockedKeys } from "./unlock.ts";

// The CLI side of the trust rules in packages/shared/src/trust.ts (ADR 0013,
// ADR 0016): pinned public keys, projects already worked on, and the newest
// versions seen, kept in trust.json in the config folder.

export type { KeyOwner };

function trustFilePath(): string {
  return join(getConfigDir(), "trust.json");
}

const fileStore: TrustStore = {
  async read(): Promise<TrustState> {
    try {
      return parseTrustState(JSON.parse(await readFile(trustFilePath(), "utf8")));
    } catch {
      return parseTrustState(undefined);
    }
  },
  async write(state: TrustState): Promise<void> {
    await writeFileSafely(trustFilePath(), `${JSON.stringify(state, null, 2)}\n`);
  },
  get resetHint() {
    return `delete ${trustFilePath()} and try again.`;
  },
};

/**
 * Asks before trusting keys this device has not seen. A service token in CI
 * has nobody to ask, and its trust.json is usually new on every run anyway,
 * so it trusts what it sees (ADR 0016 lists this as a limit).
 */
const confirmNewKeys: ConfirmNewKeys = async (owners) => {
  if (readServiceToken() !== undefined) {
    return true;
  }
  output.warn("This device has not seen these keys before:");
  for (const owner of owners) {
    output.info(`  ${owner.label.padEnd(28)} ${owner.fingerprint}`);
  }
  return askConfirm(
    owners.length === 1
      ? `Does ${owners[0]?.label ?? "they"} see the same fingerprint? Trust this key?`
      : "Did each of them confirm their fingerprint? Trust these keys?",
    "Run this command once in a terminal, compare the fingerprints with each person and confirm.",
  );
};

async function fingerprintOf(publicKey: string): Promise<string> {
  return fingerprint(await fromBase64Url(publicKey));
}

/** Runs a trust check, turning its failure into a CLI error with a hint. */
async function asCliError<Result>(check: () => Promise<Result>): Promise<Result> {
  try {
    return await check();
  } catch (error) {
    if (error instanceof TrustError) {
      throw new CliError(error.message, { hint: error.hint });
    }
    throw error;
  }
}

/** For lists that are only shown: refuses changed keys, pins nothing new on a known project. */
export function checkListedPublicKeys(projectId: string, owners: KeyOwner[]): Promise<void> {
  return asCliError(() => checkListedKeys(fileStore, projectId, owners));
}

/** Pins keys the person just confirmed, or that this device made itself. */
export function pinConfirmedPublicKeys(projectId: string, owners: KeyOwner[]): Promise<void> {
  return asCliError(() => pinConfirmedKeys(fileStore, projectId, owners));
}

/** Before wrapping a key for these owners: changed keys are refused, new ones need a yes. */
export async function trustRecipients(
  projectId: string,
  owners: KeyOwner[],
  keys: UnlockedKeys,
): Promise<void> {
  const ownPublicKey = await toBase64Url(keys.publicKey);
  return asCliError(() =>
    trustKeyOwners({
      store: fileStore,
      projectId,
      owners,
      ownPublicKey,
      confirm: confirmNewKeys,
      fingerprintOf,
    }),
  );
}

/** Opens an environment key from the server, after checking who made it. */
export async function openTrustedEnvKey(input: {
  projectId: string;
  environment: { id: string; name: string };
  key: WrappedKeyFromServer;
  keys: UnlockedKeys;
}): Promise<Uint8Array> {
  const publicKey = await toBase64Url(input.keys.publicKey);
  return asCliError(() =>
    openWrappedEnvKey({
      store: fileStore,
      projectId: input.projectId,
      environment: input.environment,
      key: input.key,
      keys: { privateKey: input.keys.privateKey, publicKey },
      confirm: confirmNewKeys,
      fingerprintOf,
    }),
  );
}

/** Refuses a version or key version older than one this device has seen. */
export function checkNotRolledBack(
  environment: { id: string; name: string },
  seen: SeenVersion,
): Promise<void> {
  return asCliError(() => assertNotRolledBack(fileStore, environment, seen));
}

/** Remembers the newest version seen. Call only after its key was accepted. */
export function rememberEnvironmentVersion(
  environment: { id: string; name: string },
  seen: SeenVersion,
): Promise<void> {
  return asCliError(() => rememberVersion(fileStore, environment, seen));
}
