/**
 * Why a crypto operation failed. Messages never include key material or
 * secret values, so they are safe to show to a user or write to a log.
 */
export type CryptoErrorCode =
  /** Wrong key, wrong context (AAD) or the data was changed. */
  | "DECRYPTION_FAILED"
  /** The data was written by a format version this code does not know. */
  | "UNSUPPORTED_FORMAT_VERSION"
  /** An argument has the wrong length, shape or range. */
  | "INVALID_INPUT"
  /** A recovery key was typed wrong: bad characters, length or checksum. */
  | "INVALID_RECOVERY_KEY"
  /** Key derivation settings are below the safe minimum. */
  | "WEAK_KDF_PARAMS";

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = "CryptoError";
    this.code = code;
  }
}

export function isCryptoError(error: unknown): error is CryptoError {
  return error instanceof CryptoError;
}
