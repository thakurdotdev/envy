# ADR 0017: Changing the master password and using the recovery key

- Status: Accepted
- Date: 2026-11-23

## Context

Every account stored a recovery copy of its private key, but no client could
use it, and the API refused to replace key material once it was set. So a
forgotten master password locked the user out even with the recovery key
(the CLI's hint said to "use your recovery key"), and a leaked master
password could never be changed.

## Decision

- **The keypair never changes.** Teammates' environment keys are wrapped for
  the public key, so changing it would need every admin to grant again.
  Only the encrypted copies of the private key are replaced.
- **`POST /v1/me/keys/challenge`** returns 32 random bytes sealed to the
  account's public key, and a token: the user id, a SHA-256 of the bytes
  and an expiry 5 minutes ahead, signed with HMAC-SHA256 under a key derived
  from `JWT_SECRET`. Nothing is stored.
- **`POST /v1/me/keys/replace`** takes the token, the opened bytes, a new
  `encryptedPrivateKey`, `kdfSalt` and `kdfParams`, and optionally a new
  `recoveryEncryptedPrivateKey`. It fails with `KEY_CHALLENGE_FAILED` unless
  the token is genuine, for this user, not expired, and the bytes match.
  This proves the client holds the private key, so a stolen session alone
  cannot lock a user out by storing junk.
- **`envy password`** and the dashboard's settings page ask for the current
  master password, then a new one. The recovery key is kept.
- **`envy recover`** and "Forgot it? Use your recovery key" on the unlock
  screen open the recovery copy with the recovery key, check that the key
  inside matches the account's public key, then store copies under a new
  master password and a **new recovery key** (the old one was typed in, so
  it is retired). The new recovery key is shown once.

## Limits

- Anyone who already copied the old encrypted private key and knows the old
  master password (or old recovery key) can still open that copy. A new
  password protects against future leaks, not past ones. If the private key
  itself may be exposed, an admin removes the member and invites them again.
- A challenge token can be used more than once within its 5 minutes, but
  only by someone who could open it, that is, the key's owner.
