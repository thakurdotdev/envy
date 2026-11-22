import { expect } from "bun:test";
import { CryptoError, type CryptoErrorCode } from "../errors.ts";

/** Checks that the promise fails with a CryptoError of the given code. */
export async function expectCryptoError(
  promise: Promise<unknown>,
  code: CryptoErrorCode,
): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof CryptoError)) {
    throw new Error(`Expected a CryptoError with code ${code}, got: ${String(error)}`);
  }
  expect(error.code).toBe(code);
}

/** Returns a copy of the bytes with one bit flipped at the given position. */
export function flipBit(bytes: Uint8Array, index: number): Uint8Array {
  const copy = bytes.slice();
  copy[index] = (copy[index] ?? 0) ^ 1;
  return copy;
}
