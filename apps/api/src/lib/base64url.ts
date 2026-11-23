import { AppError } from "./errors.ts";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/**
 * How many bytes a base64url string holds, or undefined if it is not valid
 * base64url without padding. Used to check key sizes the API never decrypts.
 */
export function base64UrlByteLength(value: string): number | undefined {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    return undefined;
  }
  const bytes = Buffer.from(value, "base64url");
  // Reject strings with leftover bits, so each value has exactly one spelling.
  if (bytes.toString("base64url") !== value) {
    return undefined;
  }
  return bytes.length;
}

// Sizes from packages/crypto. The API cannot decrypt anything, but it can
// refuse values that no current client could have made.
export const BYTE_SIZES = {
  publicKey: 32,
  salt: 16,
  /** Format byte + 24-byte nonce + 32-byte key + 16-byte tag. */
  encryptedPrivateKey: 1 + 24 + 32 + 16,
  /**
   * Format byte 2 + 24-byte nonce + 32-byte key + 16-byte tag. Format 1
   * (anonymous sealed boxes) is still served but no longer accepted (ADR 0016).
   */
  wrappedEnvKey: 1 + 24 + 32 + 16,
  nonce: 24,
  /** Format byte + 16-byte tag, for an empty plaintext. */
  minimumCiphertext: 1 + 16,
} as const;

export function assertBase64UrlBytes(value: string, expectedBytes: number, field: string): void {
  if (base64UrlByteLength(value) !== expectedBytes) {
    throw new AppError(
      "VALIDATION_FAILED",
      `The value of ${field} must be ${expectedBytes} bytes in base64url.`,
      400,
    );
  }
}
