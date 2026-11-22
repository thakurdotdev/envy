import { CryptoError } from "./errors.ts";
import { assertLength } from "./format.ts";
import { loadSodium } from "./sodium.ts";

// XChaCha20-Poly1305 encrypts and authenticates in one step: decryption fails
// if the key, the nonce, the ciphertext or the additional data (AAD) differ.
// AAD is not secret; it records where the data belongs so it cannot be moved.

export const SYMMETRIC_KEY_BYTES = 32;
export const NONCE_BYTES = 24;

export async function encryptWithKey(
  plaintext: Uint8Array,
  key: Uint8Array,
  additionalData: string,
): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> {
  const sodium = await loadSodium();
  assertLength(key, SYMMETRIC_KEY_BYTES, "key");
  // A nonce ("number used once") must never repeat for the same key. 24
  // random bytes are large enough that a repeat will not happen by chance.
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    additionalData,
    null,
    nonce,
    key,
  );
  return { nonce, ciphertext };
}

export async function decryptWithKey(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
  additionalData: string,
): Promise<Uint8Array> {
  const sodium = await loadSodium();
  assertLength(key, SYMMETRIC_KEY_BYTES, "key");
  assertLength(nonce, NONCE_BYTES, "nonce");
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      additionalData,
      nonce,
      key,
    );
  } catch {
    throw new CryptoError(
      "DECRYPTION_FAILED",
      "The data could not be decrypted. The key is wrong, or the data was changed or moved.",
    );
  }
}
