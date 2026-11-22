import { loadSodium } from "./sodium.ts";

/**
 * Overwrites a key with zeros once it is no longer needed. This is best
 * effort: JavaScript may have copied the bytes elsewhere, so keep keys in
 * memory for as short a time as possible as well.
 */
export async function clearKey(key: Uint8Array): Promise<void> {
  const sodium = await loadSodium();
  sodium.memzero(key);
}
