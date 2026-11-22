import { toBase32 } from "./encoding.ts";
import { assertLength } from "./format.ts";
import { loadSodium } from "./sodium.ts";
import { PUBLIC_KEY_BYTES } from "./user-keys.ts";

const FINGERPRINT_BYTES = 10;
const GROUP_LENGTH = 4;
// A fixed label in front of the key, so this hash cannot be confused with
// any other hash of the same bytes.
const FINGERPRINT_CONTEXT = new TextEncoder().encode("envy/fingerprint/v1");

/**
 * Makes a short code for a public key that two people can read to each other
 * to check they see the same key, for example `K3QZ 7MPA X2NF 4RTD`.
 *
 * @param publicKey A 32-byte public key.
 * @returns 16 base32 characters (80 bits of a BLAKE2b hash) in groups of four.
 *   Different keys give different codes; forging a match is not practical.
 */
export async function fingerprint(publicKey: Uint8Array): Promise<string> {
  const sodium = await loadSodium();
  assertLength(publicKey, PUBLIC_KEY_BYTES, "public key");
  const input = new Uint8Array(FINGERPRINT_CONTEXT.length + publicKey.length);
  input.set(FINGERPRINT_CONTEXT, 0);
  input.set(publicKey, FINGERPRINT_CONTEXT.length);
  const hash = sodium.crypto_generichash(32, input, null);
  const text = toBase32(hash.subarray(0, FINGERPRINT_BYTES));
  const groups: string[] = [];
  for (let start = 0; start < text.length; start += GROUP_LENGTH) {
    groups.push(text.slice(start, start + GROUP_LENGTH));
  }
  return groups.join(" ");
}
