import { CryptoError } from "./errors.ts";
import { assertLength } from "./format.ts";
import { loadSodium } from "./sodium.ts";
import { PRIVATE_KEY_BYTES, PUBLIC_KEY_BYTES } from "./user-keys.ts";

// A short proof that a client holds the private key for a public key. The
// server sends random bytes sealed to the public key; only the private key's
// holder can send them back. The API uses it before letting an account
// replace its encrypted private key, so a stolen session alone cannot lock
// someone out by overwriting it.

export const CHALLENGE_BYTES = 32;

/**
 * Makes a new challenge for a public key.
 *
 * @param publicKey The 32-byte public key whose owner must answer.
 * @returns The answer to keep (32 random bytes; compare it in constant time)
 *   and the sealed copy to send.
 */
export async function makeKeyChallenge(
  publicKey: Uint8Array,
): Promise<{ answer: Uint8Array; sealed: Uint8Array }> {
  const sodium = await loadSodium();
  assertLength(publicKey, PUBLIC_KEY_BYTES, "public key");
  const answer = sodium.randombytes_buf(CHALLENGE_BYTES);
  return { answer, sealed: sodium.crypto_box_seal(answer, publicKey) };
}

/**
 * Opens a challenge made by {@link makeKeyChallenge}.
 *
 * @param sealed The sealed challenge from the server.
 * @param privateKey The private key it was sealed for.
 * @returns The 32-byte answer. Throws DECRYPTION_FAILED for another key.
 */
export async function answerKeyChallenge(
  sealed: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await loadSodium();
  assertLength(privateKey, PRIVATE_KEY_BYTES, "private key");
  const publicKey = sodium.crypto_scalarmult_base(privateKey);
  let answer: Uint8Array;
  try {
    answer = sodium.crypto_box_seal_open(sealed, publicKey, privateKey);
  } catch {
    throw new CryptoError(
      "DECRYPTION_FAILED",
      "The challenge could not be opened. It was made for a different key.",
    );
  }
  assertLength(answer, CHALLENGE_BYTES, "challenge answer");
  return answer;
}
