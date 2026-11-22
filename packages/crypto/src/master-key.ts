import { CryptoError } from "./errors.ts";
import { loadSodium } from "./sodium.ts";

// Argon2id is a password hashing function that is slow and needs a lot of
// memory on purpose, so guessing passwords from a leaked database is costly.

/** Settings for turning a master password into a key. Stored next to the salt. */
export type KdfParams = {
  algorithm: "argon2id13";
  /** How many passes Argon2id makes over memory. */
  opsLimit: number;
  /** How much memory Argon2id uses, in bytes. */
  memLimitBytes: number;
};

export const SALT_BYTES = 16;
const MASTER_KEY_BYTES = 32;
const MEBIBYTE = 1024 * 1024;

// The minimum matches common guidance for Argon2id (64 MiB, 3 passes) and
// still runs in about a second in a browser. A server cannot make a client
// accept anything weaker, and the maximum stops it from making clients hang.
const MIN_OPS_LIMIT = 3;
const MAX_OPS_LIMIT = 20;
const MIN_MEM_LIMIT_BYTES = 64 * MEBIBYTE;
const MAX_MEM_LIMIT_BYTES = 1024 * MEBIBYTE;

export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: "argon2id13",
  opsLimit: MIN_OPS_LIMIT,
  memLimitBytes: MIN_MEM_LIMIT_BYTES,
};

/**
 * Makes a new random salt for a user's master password. Called once at signup
 * and whenever the master password changes.
 *
 * @returns 16 random bytes. Not secret; stored on the server with the params.
 */
export async function generateSalt(): Promise<Uint8Array> {
  const sodium = await loadSodium();
  return sodium.randombytes_buf(SALT_BYTES);
}

/**
 * Turns the master password into the 32-byte master key with Argon2id.
 *
 * @param password The master password. Unicode is normalised (NFC) first, so
 *   the same password typed on different systems gives the same key.
 * @param salt The user's salt from {@link generateSalt}.
 * @param params The stored settings. Rejected with WEAK_KDF_PARAMS if they
 *   are below the safe minimum, because they may come from an untrusted server.
 * @returns The master key. It must never leave the device; clear it with
 *   `clearKey` when done.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  const sodium = await loadSodium();
  assertSafeKdfParams(params);
  if (salt.length !== SALT_BYTES) {
    throw new CryptoError("INVALID_INPUT", `The salt must be ${SALT_BYTES} bytes long.`);
  }
  if (password.length === 0) {
    throw new CryptoError("INVALID_INPUT", "The master password is empty.");
  }
  return sodium.crypto_pwhash(
    MASTER_KEY_BYTES,
    password.normalize("NFC"),
    salt,
    params.opsLimit,
    params.memLimitBytes,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function assertSafeKdfParams(params: KdfParams): void {
  const isKnownAlgorithm = params.algorithm === "argon2id13";
  const isOpsLimitInRange =
    Number.isInteger(params.opsLimit) &&
    params.opsLimit >= MIN_OPS_LIMIT &&
    params.opsLimit <= MAX_OPS_LIMIT;
  const isMemLimitInRange =
    Number.isInteger(params.memLimitBytes) &&
    params.memLimitBytes >= MIN_MEM_LIMIT_BYTES &&
    params.memLimitBytes <= MAX_MEM_LIMIT_BYTES;

  if (!isKnownAlgorithm || !isOpsLimitInRange || !isMemLimitInRange) {
    throw new CryptoError(
      "WEAK_KDF_PARAMS",
      "The master password settings from the server are outside the safe range, so they were not used.",
    );
  }
}
