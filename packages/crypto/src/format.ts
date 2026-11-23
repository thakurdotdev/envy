import { CryptoError } from "./errors.ts";

/**
 * Every stored blob starts with one byte that says which format wrote it.
 * A new algorithm or layout gets a new number, and old data keeps working
 * because readers pick the matching code path.
 */
export const FORMAT_VERSION_1 = 1;
/** Wrapped environment keys that prove who made them (ADR 0016). */
export const FORMAT_VERSION_2 = 2;

export function addFormatVersion(version: number, body: Uint8Array): Uint8Array {
  const blob = new Uint8Array(body.length + 1);
  blob[0] = version;
  blob.set(body, 1);
  return blob;
}

/** Splits a blob into its format version and the bytes after it. */
export function readFormatVersion(blob: Uint8Array): { version: number; body: Uint8Array } {
  const version = blob[0];
  if (version === undefined) {
    throw new CryptoError("INVALID_INPUT", "The encrypted data is empty.");
  }
  return { version, body: blob.subarray(1) };
}

export function unsupportedFormat(version: number): CryptoError {
  return new CryptoError(
    "UNSUPPORTED_FORMAT_VERSION",
    `The encrypted data uses format version ${version}, which this version of Envy cannot read. Update Envy and try again.`,
  );
}

export function assertLength(bytes: Uint8Array, expected: number, what: string): void {
  if (bytes.length !== expected) {
    throw new CryptoError("INVALID_INPUT", `The ${what} must be ${expected} bytes long.`);
  }
}
