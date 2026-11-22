import { CryptoError } from "./errors.ts";
import { loadSodium } from "./sodium.ts";

/**
 * Turns bytes into a base64url string (URL-safe, no padding). The API sends
 * every key, nonce and ciphertext in this form.
 */
export async function toBase64Url(bytes: Uint8Array): Promise<string> {
  const sodium = await loadSodium();
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/** Reads a base64url string back into bytes. Throws INVALID_INPUT if it is not valid. */
export async function fromBase64Url(text: string): Promise<Uint8Array> {
  const sodium = await loadSodium();
  try {
    return sodium.from_base64(text, sodium.base64_variants.URLSAFE_NO_PADDING);
  } catch {
    throw new CryptoError("INVALID_INPUT", "The value is not valid base64url.");
  }
}

// Base32 (RFC 4648 alphabet) is used for text people read or type, such as
// recovery keys and fingerprints: it has no lookalike symbols and no case.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function toBase32(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      output += BASE32_ALPHABET.charAt((buffer >> bitsInBuffer) & 31);
    }
  }
  if (bitsInBuffer > 0) {
    output += BASE32_ALPHABET.charAt((buffer << (5 - bitsInBuffer)) & 31);
  }
  return output;
}

/** Returns undefined when the text has a character outside the base32 alphabet. */
export function fromBase32(text: string): Uint8Array | undefined {
  const bytes: number[] = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const character of text) {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value === -1) {
      return undefined;
    }
    buffer = ((buffer << 5) | value) & 0xffff;
    bitsInBuffer += 5;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes.push((buffer >> bitsInBuffer) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
