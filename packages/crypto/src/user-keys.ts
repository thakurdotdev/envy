import { decryptWithKey, encryptWithKey, NONCE_BYTES } from "./aead.ts";
import { CryptoError } from "./errors.ts";
import {
  addFormatVersion,
  assertLength,
  FORMAT_VERSION_1,
  readFormatVersion,
  unsupportedFormat,
} from "./format.ts";
import { loadSodium } from "./sodium.ts";

export const PUBLIC_KEY_BYTES = 32;
export const PRIVATE_KEY_BYTES = 32;

// Fixed AAD so an encrypted private key cannot be passed off as any other
// kind of blob that happens to use the same key.
const PRIVATE_KEY_CONTEXT = "envy/private-key/v1";

export type UserKeys = {
  /** Shared openly; teammates use it to give this user access. */
  publicKey: Uint8Array;
  /** Never leaves the device unencrypted. */
  privateKey: Uint8Array;
};

/**
 * Makes a new X25519 keypair for a user or a service token.
 *
 * @returns 32-byte public and private keys.
 */
export async function generateUserKeys(): Promise<UserKeys> {
  const sodium = await loadSodium();
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return { publicKey, privateKey };
}

/**
 * Works out the public key that belongs to a private key.
 *
 * @param privateKey A 32-byte private key.
 * @returns Its 32-byte public key.
 */
export async function getPublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  const sodium = await loadSodium();
  assertLength(privateKey, PRIVATE_KEY_BYTES, "private key");
  return sodium.crypto_scalarmult_base(privateKey);
}

/**
 * Encrypts a private key so it can be stored on the server.
 *
 * @param privateKey The user's private key.
 * @param wrappingKey The master key or the recovery key (32 bytes).
 * @returns One blob: format version, nonce, then ciphertext. Safe to store;
 *   useless without the wrapping key.
 */
export async function encryptPrivateKey(
  privateKey: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> {
  assertLength(privateKey, PRIVATE_KEY_BYTES, "private key");
  const { nonce, ciphertext } = await encryptWithKey(privateKey, wrappingKey, PRIVATE_KEY_CONTEXT);
  const body = new Uint8Array(nonce.length + ciphertext.length);
  body.set(nonce, 0);
  body.set(ciphertext, nonce.length);
  return addFormatVersion(FORMAT_VERSION_1, body);
}

/**
 * Decrypts a private key made by {@link encryptPrivateKey}.
 *
 * @param encryptedPrivateKey The stored blob.
 * @param wrappingKey The master key or recovery key it was encrypted with.
 * @returns The private key. Throws DECRYPTION_FAILED for a wrong key or a
 *   changed blob, and UNSUPPORTED_FORMAT_VERSION for an unknown format.
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> {
  const { version, body } = readFormatVersion(encryptedPrivateKey);
  if (version !== FORMAT_VERSION_1) {
    throw unsupportedFormat(version);
  }
  if (body.length <= NONCE_BYTES) {
    throw new CryptoError("INVALID_INPUT", "The encrypted private key is too short.");
  }
  const nonce = body.subarray(0, NONCE_BYTES);
  const ciphertext = body.subarray(NONCE_BYTES);
  const privateKey = await decryptWithKey(ciphertext, nonce, wrappingKey, PRIVATE_KEY_CONTEXT);
  assertLength(privateKey, PRIVATE_KEY_BYTES, "private key");
  return privateKey;
}
