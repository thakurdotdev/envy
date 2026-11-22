// All crypto in Envy goes through this package. It only calls libsodium:
// no file system, no network and no logging. The CLI and the web both use
// it, so data written by one can always be read by the other.

export { ready } from "./sodium.ts";
export { CryptoError, isCryptoError, type CryptoErrorCode } from "./errors.ts";
export { clearKey } from "./memory.ts";
export { fromBase64Url, toBase64Url } from "./encoding.ts";
export { FORMAT_VERSION_1 } from "./format.ts";
export {
  DEFAULT_KDF_PARAMS,
  deriveMasterKey,
  generateSalt,
  SALT_BYTES,
  type KdfParams,
} from "./master-key.ts";
export {
  decryptPrivateKey,
  encryptPrivateKey,
  generateUserKeys,
  getPublicKey,
  PRIVATE_KEY_BYTES,
  PUBLIC_KEY_BYTES,
  type UserKeys,
} from "./user-keys.ts";
export { generateRecoveryKey, parseRecoveryKey, type RecoveryKey } from "./recovery-key.ts";
export { generateEnvKey, unwrapEnvKey, wrapEnvKey } from "./env-keys.ts";
export {
  decryptSecrets,
  encryptSecrets,
  type EncryptedSecrets,
  type Secrets,
  type SecretsPlace,
} from "./secrets.ts";
export { fingerprint } from "./fingerprint.ts";
