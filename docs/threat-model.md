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
   random bytes, wrapped for each member (and service token) with a key that
   only the sender and that recipient can compute (X25519 key exchange, then
   XChaCha20-Poly1305). Opening it needs the sender's public key, so a key
   proves which member made it; a server that only knows public keys cannot
   make one (ADR 0016). Keys made before ADR 0016 used an anonymous sealed
   box and are only accepted under the rules in "Trust on the client".
5. **Environment key** → **secrets blob**. All variables of one environment as
   JSON, encrypted with XChaCha20-Poly1305 and a fresh random 24-byte nonce
   (a "number used once").

## What the crypto package guarantees

All of this is in `packages/crypto` and tested there.

- **Tampering is detected.** XChaCha20-Poly1305 is authenticated: any
  changed bit makes decryption fail with `DECRYPTION_FAILED`.
- **Wrapped keys cannot be forged or moved.** A wrapped environment key
  opens only with the sender's public key, the recipient's private key, and
  the environment id and key version it was made for. A key made by anyone
  else, or moved to another environment or key version, fails to open.
- **Blobs cannot be moved.** A secrets blob is bound through additional
  authenticated data (AAD) to its project id, environment id, version and key
  version. A server that swaps blobs between environments, or relabels an old
  version with a newer number, causes a decryption failure. Ids may not
  contain `|`, the separator, so two places never produce the same AAD.
  Serving an old version honestly labelled as the latest is not a crypto
  failure; the CLI catches it with `trust.json` (below).
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
| Server rolls an environment back           | CLI and web refuse                   | The newest version and key version seen are kept; older ones, or pushing with an older key, are refused            |
| Server makes its own environment key       | CLI and web refuse                   | Wrapped keys prove their sender; the sender must be a trusted key (ADR 0016)                                       |
| Server adds a fake member or token         | Needs the person's yes               | On a project already known, a key not seen before is only used after its fingerprint is confirmed (ADR 0016)       |
| Server swaps a public key during an invite | The server could give itself access  | **Known v1 limit.** Fingerprints are shown on invite and in `envy members ls`; users must compare them out of band |
| Server swaps a key it already showed       | CLI and web refuse                   | Each member's and token's public key is pinned; a changed key is refused                                           |
| Stolen laptop                              | Cached keys can be read              | OS keychain; `envy logout` and session revoke from the web                                                         |
| Removed member kept copies                 | They know the old values             | New key version for every environment they could read, and a reminder to change the real credentials               |
| Password, token or invite guessing         | Account abuse                        | Rate limits per IP and per user; long random tokens; tokens stored as hashes                                       |
| Malicious `.envy.json` in a cloned repo    | Overwrite or upload other files      | `file` must stay inside the project folder; links (the file or any folder on its path) leading outside are refused |
| Weak master password                       | Leaked data could be cracked offline | Argon2id slows this down but cannot stop it for very weak passwords; the UI should ask for a strong one            |
| Lost master password and recovery key      | Data is gone for that user           | By design. An admin can grant access again with a new keypair                                                      |

## Trust on the client

The CLI (`trust.json`) and the web dashboard (browser storage, per account)
follow the same rules, in `packages/shared/src/trust.ts`:

- The first time a device works on a project, it trusts the public keys it
  sees. After that, a key it has not seen is used (to wrap a key for, or as
  the maker of a key) only once the person confirms its fingerprint.
- A public key that changed is always refused.
- The newest version and key version of each environment are remembered;
  an older one is refused.
- A key in the old format (no sender) is accepted only for a key version
  already seen, or for an environment never seen.

The web dashboard is only as trustworthy as the server that sends its
JavaScript: whoever controls `WEB_URL` can change the page to read what is
typed into it. The CLI does not have this weakness, so prefer it for the
most sensitive work, and host the dashboard separately from the API.

## Team changes

- **Invites** are single-use, expire after 7 days, and only work for the
  GitHub account with the invited email. Only a hash of the token is stored,
  and tokens are hidden in logs.
- **Granting** happens on an admin's machine: the admin unwraps each
  environment key and wraps it for the new member's public key. Before that,
  the CLI shows the member's fingerprint, and the member sees the same code
  when accepting (worked out from their own key, never from the server's
  answer). Comparing the two in person or on a call defeats a server
  that swaps public keys.
- **Removing** an active member rotates every environment key in the same
  transaction: new keys go only to remaining members and active service
  tokens, and the latest secrets are re-encrypted. Service tokens the member
  made are revoked (they saw the full token once) and their unused invites
  end. Versions written after the removal cannot be decrypted
  with any key the removed member had (tested). Older versions stay readable
  to anyone who kept the old key, so the CLI reminds the admin to change the
  real credentials.

## Service tokens (CI)

- A token is `envy_<tokenId>_<privateKey>`. Only `envy_<tokenId>` is sent to
  the API; the server stores a hash of it, the token's public key and the
  environment key wrapped for that public key. A database leak therefore
  exposes no usable token and no way to decrypt.
- A token reads one environment and nothing else: no pushes, no other
  environments, no shared layer, no project or member routes.
- A leaked token gives read access to that one environment until it is
  revoked or expires. Revoking takes effect on the next request.
- Rotating an environment's key re-wraps it for its active tokens, so a
  member's removal does not break CI, except for tokens that member made:
  those are revoked with them.
- A token in CI usually starts with no `trust.json`, so it trusts the maker
  of its key on first use (ADR 0016). A server that controls the API can
  therefore still hand a fresh CI run a key and secrets of its own making.

## Out of scope for v1

- A malicious client build or a hacked developer machine. Envy cannot protect
  secrets from code running as the user.
- Hiding metadata (key names, member lists, timing) from the server.
- Forward secrecy for old secret versions: a member who still has an old
  environment key can read old versions that were encrypted with it.
- A removed member working with the server: their key stays trusted on
  other devices, so they could make a key those devices accept (ADR 0016).
