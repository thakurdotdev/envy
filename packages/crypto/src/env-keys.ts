import { decryptWithKey, encryptWithKey, NONCE_BYTES, SYMMETRIC_KEY_BYTES } from "./aead.ts";
import { CryptoError } from "./errors.ts";
import {
  addFormatVersion,
  assertLength,
  FORMAT_VERSION_1,
  FORMAT_VERSION_2,
  readFormatVersion,
  unsupportedFormat,
} from "./format.ts";
import { clearKey } from "./memory.ts";
import { loadSodium } from "./sodium.ts";
import { PRIVATE_KEY_BYTES, PUBLIC_KEY_BYTES } from "./user-keys.ts";

// Format 2 (ADR 0016): the environment key is encrypted with a key that only
// the sender and the recipient can compute (an X25519 key exchange, through
// libsodium's crypto_box_beforenm). Opening it needs the sender's public key,
// so a wrapped key that opens was made by someone holding the sender's
// private key: a server that only knows public keys cannot make one.
//
// Format 1 used an anonymous sealed box. Anyone, the server included, could
// make one, so it is only read for old data (see unwrapLegacyEnvKey).

/** Where a wrapped key belongs. Bound into the encryption so it cannot be moved. */
export type EnvKeyPlace = {
  environmentId: string;
  /** The key version this environment key is for. */
  keyVersion: number;
};

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
 * token), in a way that proves who sent it.
 *
 * @param envKey The 32-byte environment key.
 * @param input.recipientPublicKey The recipient's 32-byte public key. Check
 *   it is really theirs first; this function cannot tell if it was swapped.
 * @param input.senderPrivateKey The private key of the person wrapping it.
 *   The recipient needs the matching public key to open it.
 * @param input.place The environment and key version this key is for.
 * @returns Format byte 2, a 24-byte nonce and the 48-byte ciphertext.
 */
export async function wrapEnvKey(
  envKey: Uint8Array,
  input: { recipientPublicKey: Uint8Array; senderPrivateKey: Uint8Array; place: EnvKeyPlace },
): Promise<Uint8Array> {
  const sodium = await loadSodium();
  assertLength(envKey, SYMMETRIC_KEY_BYTES, "environment key");
  assertLength(input.recipientPublicKey, PUBLIC_KEY_BYTES, "public key");
  assertLength(input.senderPrivateKey, PRIVATE_KEY_BYTES, "private key");
  const senderPublicKey = sodium.crypto_scalarmult_base(input.senderPrivateKey);
  const sharedKey = sodium.crypto_box_beforenm(input.recipientPublicKey, input.senderPrivateKey);
  try {
    const { nonce, ciphertext } = await encryptWithKey(
      envKey,
      sharedKey,
      await buildAdditionalData(input.place, senderPublicKey, input.recipientPublicKey),
    );
    const body = new Uint8Array(nonce.length + ciphertext.length);
    body.set(nonce, 0);
    body.set(ciphertext, nonce.length);
    return addFormatVersion(FORMAT_VERSION_2, body);
  } finally {
    await clearKey(sharedKey);
  }
}

/**
 * Opens a wrapped environment key made by {@link wrapEnvKey}.
 *
 * @param wrappedEnvKey The stored blob, format 2.
 * @param input.recipientPrivateKey The recipient's private key.
 * @param input.senderPublicKey The public key of who the server says made it.
 *   Check it is a key you trust: opening proves only that this key made it.
 * @param input.place Where the caller expects the key to belong.
 * @returns The 32-byte environment key. Throws DECRYPTION_FAILED if another
 *   sender made it, it was made for someone else or another place, or it was
 *   changed. Throws UNSUPPORTED_FORMAT_VERSION for format 1: use
 *   {@link isLegacyWrappedEnvKey} and {@link unwrapLegacyEnvKey} for those.
 */
export async function unwrapEnvKey(
  wrappedEnvKey: Uint8Array,
  input: { recipientPrivateKey: Uint8Array; senderPublicKey: Uint8Array; place: EnvKeyPlace },
): Promise<Uint8Array> {
  const sodium = await loadSodium();
  const { version, body } = readFormatVersion(wrappedEnvKey);
  if (version !== FORMAT_VERSION_2) {
    throw unsupportedFormat(version);
  }
  assertLength(input.recipientPrivateKey, PRIVATE_KEY_BYTES, "private key");
  assertLength(input.senderPublicKey, PUBLIC_KEY_BYTES, "public key");
  assertLength(body, NONCE_BYTES + SYMMETRIC_KEY_BYTES + 16, "wrapped environment key");
  const recipientPublicKey = sodium.crypto_scalarmult_base(input.recipientPrivateKey);
  const sharedKey = sodium.crypto_box_beforenm(input.senderPublicKey, input.recipientPrivateKey);
  try {
    const envKey = await decryptWithKey(
      body.subarray(NONCE_BYTES),
      body.subarray(0, NONCE_BYTES),
      sharedKey,
      await buildAdditionalData(input.place, input.senderPublicKey, recipientPublicKey),
    ).catch(() => {
      throw new CryptoError(
        "DECRYPTION_FAILED",
        "The environment key could not be opened. Someone else made it, it was made for a different key or environment, or it was changed.",
      );
    });
    assertLength(envKey, SYMMETRIC_KEY_BYTES, "environment key");
    return envKey;
  } finally {
    await clearKey(sharedKey);
  }
}

/**
 * True for a format 1 wrapped key: an anonymous sealed box that does not say
 * who made it. Callers decide whether to trust one (ADR 0016).
 */
export function isLegacyWrappedEnvKey(wrappedEnvKey: Uint8Array): boolean {
  return readFormatVersion(wrappedEnvKey).version === FORMAT_VERSION_1;
}

/**
 * Opens a format 1 wrapped key (a sealed box). Anyone who knows the public
 * key, the server included, could have made it, so only call this after the
 * caller's own checks say an old key is acceptable here.
 *
 * @param wrappedEnvKey The stored blob, format 1.
 * @param privateKey The recipient's private key.
 * @returns The 32-byte environment key. Throws DECRYPTION_FAILED if it was
 *   wrapped for someone else or changed.
 */
export async function unwrapLegacyEnvKey(
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

// Binds the key to its environment, key version and direction. Without it a
// server could hand out an old key (one a removed member knows) as the new
// one, or move a key from one environment to another.
async function buildAdditionalData(
  place: EnvKeyPlace,
  senderPublicKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): Promise<string> {
  const sodium = await loadSodium();
  if (!Number.isInteger(place.keyVersion) || place.keyVersion < 1) {
    throw new CryptoError("INVALID_INPUT", "The key version must be a whole number from 1.");
  }
  if (place.environmentId === "" || place.environmentId.includes("|")) {
    throw new CryptoError("INVALID_INPUT", "The environment id is not valid.");
  }
  return [
    "envy/env-key/v2",
    place.environmentId,
    String(place.keyVersion),
    sodium.to_hex(senderPublicKey),
    sodium.to_hex(recipientPublicKey),
  ].join("|");
}
