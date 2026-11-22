import { SYMMETRIC_KEY_BYTES } from "./aead.ts";
import { CryptoError } from "./errors.ts";
import {
  addFormatVersion,
  assertLength,
  FORMAT_VERSION_1,
  readFormatVersion,
  unsupportedFormat,
} from "./format.ts";
import { loadSodium } from "./sodium.ts";
import { PRIVATE_KEY_BYTES, PUBLIC_KEY_BYTES } from "./user-keys.ts";

/**
 * Makes a new environment key. Each environment gets a new one for every key
 * version (for example after a member is removed).
 *
 * @returns 32 random bytes. Never stored unencrypted; share it only through
 *   {@link wrapEnvKey}.
 */
export async function generateEnvKey(): Promise<Uint8Array> {
  const sodium = await loadSodium();
  return sodium.randombytes_buf(SYMMETRIC_KEY_BYTES);
}

/**
 * Encrypts an environment key for one recipient (a member or a service
 * token), using a sealed box: only the holder of the matching private key
 * can open it, and the sender stays anonymous.
 *
 * @param envKey The 32-byte environment key.
 * @param recipientPublicKey The recipient's 32-byte public key. Check its
 *   fingerprint first; this function cannot tell if the server swapped it.
 * @returns The wrapped key with a format version byte in front.
 */
export async function wrapEnvKey(
  envKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await loadSodium();
  assertLength(envKey, SYMMETRIC_KEY_BYTES, "environment key");
  assertLength(recipientPublicKey, PUBLIC_KEY_BYTES, "public key");
  const sealed = sodium.crypto_box_seal(envKey, recipientPublicKey);
  return addFormatVersion(FORMAT_VERSION_1, sealed);
}

/**
 * Opens a wrapped environment key made by {@link wrapEnvKey}.
 *
 * @param wrappedEnvKey The stored blob.
 * @param privateKey The recipient's private key.
 * @returns The 32-byte environment key. Throws DECRYPTION_FAILED if it was
 *   wrapped for someone else or changed.
 */
export async function unwrapEnvKey(
  wrappedEnvKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await loadSodium();
  const { version, body } = readFormatVersion(wrappedEnvKey);
  if (version !== FORMAT_VERSION_1) {
    throw unsupportedFormat(version);
  }
  assertLength(privateKey, PRIVATE_KEY_BYTES, "private key");
  const publicKey = sodium.crypto_scalarmult_base(privateKey);
  let envKey: Uint8Array;
  try {
    envKey = sodium.crypto_box_seal_open(body, publicKey, privateKey);
  } catch {
    throw new CryptoError(
      "DECRYPTION_FAILED",
      "The environment key could not be opened. It was made for a different key, or it was changed.",
    );
  }
  assertLength(envKey, SYMMETRIC_KEY_BYTES, "environment key");
  return envKey;
}
