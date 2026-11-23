# ADR 0005: Crypto package details

- Status: Accepted
- Date: 2026-11-22

## Context

The plan fixes the algorithms and the function list for `packages/crypto`
but leaves some details open.

## Decision

- **Every function is async** and loads libsodium itself, so callers can
  never use it before it is ready. `ready()` is still exported to load it
  early.
- **Argon2id settings:** 64 MiB and 3 passes by default, which is also the
  minimum a client accepts. The maximum is 1 GiB and 20 passes. About 0.3 s
  in Bun on the dev machine. Passwords are Unicode-normalised (NFC) first.
- **Salt and settings are separate values** (`kdf_salt` and `kdf_params`
  columns), matching the data model.
- **Blob layouts (format version 1):**
  - encrypted private key: `[1][24-byte nonce][ciphertext]`, AAD `envy/private-key/v1`
  - wrapped env key: `[1][crypto_box_seal output]` (read only since ADR 0016, which adds format 2: `[2][24-byte nonce][ciphertext]`)
  - secrets: ciphertext column `[1][ciphertext]`, nonce column separate, AAD
    `envy/secrets/v1|projectId|environmentId|version|keyVersion`
- **Recovery key:** 32 random bytes plus a 2-byte BLAKE2b checksum, printed as
  base32 in groups of five. A typo is reported as `INVALID_RECOVERY_KEY`
  instead of failing later as a wrong key.
- **Fingerprint:** first 10 bytes of BLAKE2b(`envy/fingerprint/v1` + public
  key), as 16 base32 characters in groups of four.
- **Extra exports** beyond the plan's list, each needed by the CLI or web:
  `generateSalt`, `getPublicKey`, `parseRecoveryKey`, `clearKey`,
  `toBase64Url` and `fromBase64Url`.
- **Errors:** one `CryptoError` class with codes `DECRYPTION_FAILED`,
  `UNSUPPORTED_FORMAT_VERSION`, `INVALID_INPUT`, `INVALID_RECOVERY_KEY` and
  `WEAK_KDF_PARAMS`. The package cannot import `packages/shared`, so the CLI
  maps these codes to the shared ones.

## Consequences

- Changing any layout or AAD means a new format version; the version 1 test
  vectors in `format-v1.test.ts` must keep passing.
