import { SYMMETRIC_KEY_BYTES } from "./aead.ts";
import { fromBase32, toBase32 } from "./encoding.ts";
import { CryptoError } from "./errors.ts";
import { loadSodium } from "./sodium.ts";

// The recovery key is shown once at signup and encrypts a second copy of the
// private key. It is 32 random bytes, so it needs no slow password hashing.
// Two checksum bytes are added to the printed form so a typo is reported as
// a typo instead of as a wrong key.

const CHECKSUM_BYTES = 2;
const GROUP_LENGTH = 5;

export type RecoveryKey = {
  /** The 32-byte key used with `encryptPrivateKey`. */
  key: Uint8Array;
  /** What the user writes down, for example `ABCDE-FGHIJ-…` (11 groups). */
  text: string;
};

/**
 * Makes a new recovery key.
 *
 * @returns The key and its printable form. Show `text` once and never store
 *   it anywhere; without it and the master password, data cannot be recovered.
 */
export async function generateRecoveryKey(): Promise<RecoveryKey> {
  const sodium = await loadSodium();
  const key = sodium.randombytes_buf(SYMMETRIC_KEY_BYTES);
  const checksum = await computeChecksum(key);
  const withChecksum = new Uint8Array(key.length + checksum.length);
  withChecksum.set(key, 0);
  withChecksum.set(checksum, key.length);
  const text = groupCharacters(toBase32(withChecksum));
  sodium.memzero(withChecksum);
  return { key, text };
}

/**
 * Reads a recovery key the user typed back. Spaces, dashes and lower case are
 * fine, and 0, 1 and 8 are read as O, I and B.
 *
 * @param text What the user typed.
 * @returns The 32-byte key. Throws INVALID_RECOVERY_KEY if the text has the
 *   wrong length, unknown characters or a checksum that does not match.
 */
export async function parseRecoveryKey(text: string): Promise<Uint8Array> {
  const sodium = await loadSodium();
  const cleaned = text
    .toUpperCase()
    .replaceAll(/[\s-]/g, "")
    .replaceAll("0", "O")
    .replaceAll("1", "I")
    .replaceAll("8", "B");
  const decoded = fromBase32(cleaned);
  if (decoded === undefined || decoded.length !== SYMMETRIC_KEY_BYTES + CHECKSUM_BYTES) {
    throw invalidRecoveryKey();
  }

  const key = decoded.slice(0, SYMMETRIC_KEY_BYTES);
  const typedChecksum = decoded.subarray(SYMMETRIC_KEY_BYTES);
  const expectedChecksum = await computeChecksum(key);
  const checksumMatches = sodium.memcmp(typedChecksum, expectedChecksum);
  sodium.memzero(decoded);
  if (!checksumMatches) {
    sodium.memzero(key);
    throw invalidRecoveryKey();
  }
  return key;
}

async function computeChecksum(key: Uint8Array): Promise<Uint8Array> {
  const sodium = await loadSodium();
  const hash = sodium.crypto_generichash(16, key, null);
  return hash.slice(0, CHECKSUM_BYTES);
}

function groupCharacters(text: string): string {
  const groups: string[] = [];
  for (let start = 0; start < text.length; start += GROUP_LENGTH) {
    groups.push(text.slice(start, start + GROUP_LENGTH));
  }
  return groups.join("-");
}

function invalidRecoveryKey(): CryptoError {
  return new CryptoError(
    "INVALID_RECOVERY_KEY",
    "That recovery key is not valid. Check it for typos and try again.",
  );
}
