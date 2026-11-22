import sodium, { ready as sodiumReady } from "libsodium-wrappers-sumo";

let readyPromise: Promise<void> | undefined;

/**
 * Loads libsodium. It is compiled to WebAssembly and has to be started once
 * before use. Safe to call many times; only the first call does any work.
 * Every function in this package calls it, so callers never have to.
 */
export function ready(): Promise<void> {
  readyPromise ??= sodiumReady;
  return readyPromise;
}

/** Returns libsodium after it has loaded. */
export async function loadSodium(): Promise<typeof sodium> {
  await ready();
  return sodium;
}
