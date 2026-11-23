# ADR 0016: Environment keys that prove who made them

- Status: Accepted
- Date: 2026-11-23

## Context

The third security audit (`docs/security-review.md`) found that a hacked
server could read new secrets. Environment keys were wrapped with an
anonymous sealed box (`crypto_box_seal`): anyone who knows a public key can
make one, and the server knows every public key. So the server could make
its own environment key, wrap it for each member, report it as a new key
version, and read every push that followed. With the same key it could also
serve made-up secrets (for example `NODE_OPTIONS`) that `envy run` would
pass to programs. `trust.json` only refused key versions that went down, and
the web dashboard had no trust checks at all.

A second way in: the CLI trusted every member key it had not seen before
(trust on first use, every time), so a server could add a fake member and
the next rotation would wrap the new key for it.

## Decision

**Wrapped key format 2.** A wrapped key is encrypted with a key that only
the sender and the recipient can compute: libsodium's X25519 key exchange
(`crypto_box_beforenm`) between the sender's private key and the
recipient's public key, then XChaCha20-Poly1305. The layout is format byte
`2`, a 24-byte random nonce and the 48-byte ciphertext (73 bytes). The
additional data is `envy/env-key/v2|<environmentId>|<keyVersion>|<sender
public key>|<recipient public key>`, so a key cannot be moved to another
environment, relabelled as another key version (such as an old key a
removed member knows passed off as the new one), or turned around.

**The API says who made each wrapped key.** `GET /v1/environments/:id/key`
now returns `sender: { userId, githubLogin, publicKey }` from the row's
`created_by`. The client opens the key with that public key and only
accepts it if the key is one it trusts (below). A server that knows only
public keys cannot make a format 2 key that opens with a member's key.

**Clients choose environment ids.** The key is bound to the environment id,
which must exist before the key is wrapped. `POST /v1/projects` takes
`environmentIds` and `POST /v1/projects/:id/environments` takes `id`: UUIDv7
values made by the client (`newUuidV7s` in `packages/shared`). A clash with
an existing id fails like any duplicate.

**The API accepts only format 2** for every new wrapped key. Format 1 rows
already stored are still served, so old data keeps working. An older client
gets a validation error on writes and "update Envy" when it reads a format 2
key.

**One set of trust rules for the CLI and the web** in
`packages/shared/src/trust.ts`. The CLI keeps the state in `trust.json`; the
web dashboard in `localStorage`, one entry per account (falling back to
memory if the browser refuses storage). The state holds pinned public keys,
the projects this device has worked on (`knownProjects`), and the newest
version and key version per environment.

- **Trust on first use, once per project.** The first time a device works
  on a project, it pins the keys it sees. After that a key it has not seen
  is used, either as a recipient or as the sender of an environment key,
  only after the person confirms its fingerprint: a prompt in the CLI (it
  fails without a terminal and says to run the command in one), a dialog
  on the web. A project counts as known when it is in `knownProjects` or
  when one of the keys is already pinned, so `trust.json` files from before
  this change keep protecting their projects.
- **A changed key is always refused**, as before (ADR 0013).
- **Lists only pin on first use.** Showing the member list on a known
  project no longer pins new keys, so a listing cannot slip in a fake
  member. Granting pins the member's key after the fingerprint check, and
  creating a service token pins the key the device just made.
- **Format 1 keys** do not say who made them. One is accepted only for a key
  version this device has already seen, or for an environment it has never
  seen. A newer key version in format 1 is refused: no current client makes
  one, so the server did.
- **Versions are remembered only after their key was accepted,** so a key
  version the server merely claims cannot widen the format 1 rule. Before a
  push, the newest key version and version seen are checked as before.
- **The web dashboard now runs every check the CLI runs**: rollback checks
  on pull and push, pinned keys, sender checks and confirmations.

## Limits

- **A service token trusts the first sender it sees.** CI has nobody to ask
  and usually starts with an empty `trust.json`, so a token in CI accepts
  the sender of its key on first use. Changed keys are still refused when
  `trust.json` persists between runs (self-hosted runners).
- **A removed member who teams up with the server** can still make a key
  that existing clients accept: their key stays pinned and they hold a
  private key. Clients cannot tell a current member from a removed one,
  because membership is the server's word.
- **A device's first contact with a project** trusts whatever it sees, as
  before. Comparing fingerprints is the defence.
- **Any member can read and make valid blobs** with an environment key they
  hold, as before: environment keys are shared secrets.

## Consequences

- Old CLIs must upgrade to write keys. Release the new CLI before deploying
  the API, so users are not stuck between the two.
- An admin can move an environment to format 2 by rotating its key (removing
  a member does this for every environment). Until then, devices new to a
  project accept its format 1 keys on first use.
- `packages/shared` now depends on `packages/crypto` (for opening keys).
