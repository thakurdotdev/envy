# Threat model

What Envy protects, from whom, and where the limits are. Update this file
whenever the design changes.

## What we protect

- **Secret values**: the variables in every environment.
- **Keys that unlock them**: each user's private key, each environment key,
  the master password and the recovery key.

Key names, project names, member lists, emails and the audit log are **not**
secret from the server. They are needed to run the service.

## Who we defend against

| Attacker                                        | Can do                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| Someone with a copy of the database or a backup | Read every row                                        |
| A hacked or dishonest server                    | Read and change every row, send clients any response  |
| A network attacker                              | Watch and change traffic, but not break HTTPS         |
| A removed team member                           | Keep everything they could read before removal        |
| A thief with a laptop                           | Read the disk and the OS keychain of a logged-in user |
| Someone guessing                                | Try many passwords, tokens or invite links            |

## How the keys fit together

Each key unlocks the one below it. Only the last one holds secret values.

1. **Master password** → **master key**, using Argon2id. Argon2id is a
   password hashing function that is slow and uses a lot of memory on purpose,
   so each guess is expensive. Settings: 64 MiB of memory, 3 passes, a random
   16-byte salt per user. The password never leaves the device.
2. **Master key** → **private key**. Each user has an X25519 keypair. The
   private key is encrypted with the master key (XChaCha20-Poly1305) and stored
   on the server, so the user can sign in on a new device.
3. **Recovery key** → a second encrypted copy of the private key. It is 32
   random bytes, shown once at signup as 55 base32 characters with a 2-byte
   checksum to catch typos.
4. **Private key** → **environment key**. Each environment key version is 32
   random bytes, wrapped for each member with a sealed box (`crypto_box_seal`)
   to their public key.
5. **Environment key** → **secrets blob**. All variables of one environment as
   JSON, encrypted with XChaCha20-Poly1305 and a fresh random 24-byte nonce
   (a "number used once").

## What the crypto package guarantees

All of this is in `packages/crypto` and tested there.

- **Tampering is detected.** XChaCha20-Poly1305 and sealed boxes are
  authenticated: any changed bit makes decryption fail with
  `DECRYPTION_FAILED`.
- **Blobs cannot be moved.** A secrets blob is bound through additional
  authenticated data (AAD) to its project id, environment id, version and key
  version. A server that swaps blobs between environments, or serves an old
  version as the latest, causes a decryption failure. Ids may not contain `|`,
  the separator, so two places never produce the same AAD.
- **Old data stays readable.** Every blob starts with a format version byte.
  Fixed version 1 test vectors are checked on every test run.
- **A server cannot weaken password hashing.** Clients refuse Argon2id
  settings below the minimum (and above a maximum that would make them hang),
  even if the server sends them.
- **Nothing is logged.** The package has no logging, and a test checks that a
  full flow, including failures, writes nothing to the console. Error messages
  never include keys or values.
- **Keys are cleared when possible.** Temporary buffers are zeroed with
  `sodium.memzero`, and callers can use `clearKey`. JavaScript can copy memory
  behind our back, so this is best effort only.

## Threats and answers

| Threat                                     | Result                               | Answer                                                                                                             |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Database or backup leaked                  | Only ciphertext and wrapped keys     | Zero-knowledge design. Argon2id makes guessing master passwords slow                                               |
| Server swaps, replays or changes blobs     | Decryption fails                     | Authenticated encryption, AAD binding, version checks                                                              |
| Server sends weak Argon2id settings        | Client refuses                       | Minimum settings are enforced on the client                                                                        |
| Server swaps a public key during an invite | The server could give itself access  | **Known v1 limit.** Fingerprints are shown on invite and in `envy members ls`; users must compare them out of band |
| Stolen laptop                              | Cached keys can be read              | OS keychain; `envy logout` and session revoke from the web                                                         |
| Removed member kept copies                 | They know the old values             | New key version for every environment they could read, and a reminder to change the real credentials               |
| Password, token or invite guessing         | Account abuse                        | Rate limits per IP and per user; long random tokens; tokens stored as hashes                                       |
| Weak master password                       | Leaked data could be cracked offline | Argon2id slows this down but cannot stop it for very weak passwords; the UI should ask for a strong one            |
| Lost master password and recovery key      | Data is gone for that user           | By design. An admin can grant access again with a new keypair                                                      |

## Out of scope for v1

- A malicious client build or a hacked developer machine. Envy cannot protect
  secrets from code running as the user.
- Hiding metadata (key names, member lists, timing) from the server.
- Forward secrecy for old secret versions: a member who still has an old
  environment key can read old versions that were encrypted with it.
