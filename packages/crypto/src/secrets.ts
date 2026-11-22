import { decryptWithKey, encryptWithKey } from "./aead.ts";
import { CryptoError } from "./errors.ts";
import {
  addFormatVersion,
  FORMAT_VERSION_1,
  readFormatVersion,
  unsupportedFormat,
} from "./format.ts";
import { loadSodium } from "./sodium.ts";

/** The variables of one environment, for example `{ "DATABASE_URL": "postgres://…" }`. */
export type Secrets = Record<string, string>;

/**
 * Where an encrypted blob belongs. It is bound into the encryption, so a blob
 * moved to another project, environment, version or key version (by a
 * hacked server, for example) fails to decrypt.
 */
export type SecretsPlace = {
  projectId: string;
  environmentId: string;
  /** The secret version number this blob is stored as. */
  version: number;
  /** The environment key version used to encrypt it. */
  keyVersion: number;
};

export type EncryptedSecrets = {
  /** Format version byte followed by the ciphertext. */
  ciphertext: Uint8Array;
  /** 24 random bytes. Not secret, but needed to decrypt. */
  nonce: Uint8Array;
};

/**
 * Encrypts all variables of an environment as one blob.
 *
 * @param secrets The variables. Keys and values must be strings.
 * @param envKey The 32-byte environment key for `place.keyVersion`.
 * @param place Where the blob will be stored; see {@link SecretsPlace}.
 * @returns Ciphertext and nonce, both safe to send to the server.
 */
export async function encryptSecrets(
  secrets: Secrets,
  envKey: Uint8Array,
  place: SecretsPlace,
): Promise<EncryptedSecrets> {
  const sodium = await loadSodium();
  assertSecretsShape(secrets);
  const plaintext = new TextEncoder().encode(JSON.stringify(secrets));
  const { nonce, ciphertext } = await encryptWithKey(
    plaintext,
    envKey,
    buildAdditionalData(FORMAT_VERSION_1, place),
  );
  sodium.memzero(plaintext);
  return { ciphertext: addFormatVersion(FORMAT_VERSION_1, ciphertext), nonce };
}

/**
 * Decrypts a blob made by {@link encryptSecrets}.
 *
 * @param encrypted Ciphertext and nonce from the server.
 * @param envKey The environment key for `place.keyVersion`.
 * @param place Where the caller expects the blob to be. It must match the
 *   place it was encrypted for exactly.
 * @returns The variables. Throws DECRYPTION_FAILED for a wrong key, a wrong
 *   place or changed data, and UNSUPPORTED_FORMAT_VERSION for an unknown format.
 */
export async function decryptSecrets(
  encrypted: EncryptedSecrets,
  envKey: Uint8Array,
  place: SecretsPlace,
): Promise<Secrets> {
  const sodium = await loadSodium();
  const { version, body } = readFormatVersion(encrypted.ciphertext);
  if (version !== FORMAT_VERSION_1) {
    throw unsupportedFormat(version);
  }
  const plaintext = await decryptWithKey(
    body,
    encrypted.nonce,
    envKey,
    buildAdditionalData(version, place),
  );
  const json = new TextDecoder().decode(plaintext);
  sodium.memzero(plaintext);
  return parseSecretsJson(json);
}

function buildAdditionalData(formatVersion: number, place: SecretsPlace): string {
  assertSafeId(place.projectId, "project id");
  assertSafeId(place.environmentId, "environment id");
  assertVersionNumber(place.version, "version");
  assertVersionNumber(place.keyVersion, "key version");
  const parts = [
    `envy/secrets/v${formatVersion}`,
    place.projectId,
    place.environmentId,
    String(place.version),
    String(place.keyVersion),
  ];
  return parts.join("|");
}

// "|" separates the parts of the AAD, so it must not appear inside an id, or
// two different places could produce the same AAD.
function assertSafeId(id: string, what: string): void {
  if (id.length === 0 || id.includes("|")) {
    throw new CryptoError("INVALID_INPUT", `The ${what} is empty or contains "|".`);
  }
}

function assertVersionNumber(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CryptoError("INVALID_INPUT", `The ${what} must be a whole number of 0 or more.`);
  }
}

function assertSecretsShape(value: unknown): asserts value is Secrets {
  const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
  const hasOnlyStringValues =
    isPlainObject && Object.values(value).every((entry) => typeof entry === "string");
  if (!hasOnlyStringValues) {
    throw new CryptoError("INVALID_INPUT", "Secrets must be an object of string values.");
  }
}

function parseSecretsJson(json: string): Secrets {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw malformedSecrets();
  }
  try {
    assertSecretsShape(parsed);
  } catch {
    throw malformedSecrets();
  }
  return parsed;
}

function malformedSecrets(): CryptoError {
  return new CryptoError(
    "DECRYPTION_FAILED",
    "The secrets were decrypted but are not in the expected format.",
  );
}
