# Security review

A walk through every place a secret value, key, token or password touches
memory, logs, errors or the network, on 2026-11-22.

## Where plaintext exists

| Place                         | What                                       | Lifetime / protection                                                                                            |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| CLI process memory            | decrypted variables, env keys, private key | Only while a command runs; key buffers are zeroed with `sodium.memzero` where possible                           |
| `.env` written by `envy pull` | variables                                  | File mode 0600; `.env` and `.env.*` are added to `.gitignore` by `envy init`; `envy doctor` warns if not ignored |
| `envy run` child process      | variables as environment variables         | Never written to disk                                                                                            |
| Browser tab memory            | decrypted variables, private key           | Wiped on lock, after 15 minutes idle and on `pagehide`                                                           |
| OS keychain                   | unlocked private key, session tokens       | OS-protected; the file fallback (0600) never holds the private key                                               |

The API, its database and its logs never hold plaintext (tested: a marker
value is absent from all requests, responses and every table, both from the
CLI and from the browser).

## Output that shows secrets on purpose

- `envy get KEY` prints one value to stdout.
- `envy login` (first time) and the web set-up page show the recovery key once.
- `envy token create` and the tokens page show a new token once.
- The web editor shows a value only after "Show" is pressed.

Diffs everywhere show key names only.

## Logs and errors

- The API logger redacts any field named like password, token, key, secret,
  ciphertext, authorization or cookie, at any depth (tested).
- Request logs contain the path only (no query string, so no OAuth codes),
  and invite tokens in paths are replaced by `[redacted]` (tested).
- Validation errors name the field, never the value (tested).
- Config errors at boot say what is wrong without printing values (tested).
- `packages/crypto` never logs (tested) and its error messages never include
  key material; `no-console` is an error in that package.
- The CLI's `--debug` / `ENVY_DEBUG=1` prints stack traces, which contain no
  values: crypto errors carry only fixed messages.

## Network

- Only ciphertext, nonces, wrapped keys, public keys, KDF salt and settings
  reach the API. Bodies carrying key material reject unknown fields.
- Service tokens send only `envy_<tokenId>`; the private key part stays local.
- HTTPS only in production (HSTS, secure cookies); CORS allows only `WEB_URL`.

## Hardening added in Phase 8

- Security headers on every API response (nosniff, frame deny, no referrer,
  `default-src 'none'`, CORP same-site, `no-store`, HSTS in production).
- 256 KiB request body limit (Bun server) and 128 KiB per encrypted environment.
- Rate limits on every write: 120 per minute per IP and per user or token,
  on top of the sign-in limits.

## Dependency audit (`bun audit`)

| Package            | Severity | Path                              | Assessment                                                                                          |
| ------------------ | -------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| esbuild ≤ 0.24.2   | moderate | drizzle-kit → esbuild             | Development tool only; the advisory is about esbuild's dev server, which we never run. Not shipped. |
| minimatch < 11.0.1 | moderate | shadcn CLI → ts-morph → minimatch | Used only when adding UI components. Not shipped.                                                   |

Nothing in the API binary, the CLI binary or the web bundle is affected.
Re-run `bun audit` before each release.

## Second audit (2026-11-22)

A full pass over the API, CLI, web dashboard and release pipeline, looking
for ways around the protections above. Every finding below is fixed and
tested; ADR 0013 has the details.

| Severity | Finding                                                                                                                                                          | Fix                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| High     | A removed admin kept a working copy of every service token they made, and rotation gave those tokens the new key, so they could read every later version         | Removal revokes the member's tokens and invites; keys sent for those tokens are dropped |
| High     | Behind a proxy the client IP was the first `X-Forwarded-For` entry, which the client controls: every per-IP limit (sign-in, writes) could be dodged              | Count `TRUST_PROXY` proxies from the right; nginx restores the visitor from Cloudflare  |
| High     | `.envy.json` is committed, and its `file` could be `../../anything` or absolute: `envy pull` would overwrite that file, `envy push` would upload it              | `file` must stay inside the folder; links pointing outside are refused                  |
| Medium   | `envy accept` and the web invite page showed the fingerprint of the key in the server's answer, so a server that swapped the key would also show a matching code | Fingerprint from the local key; refuse if the server's copy differs                     |
| Medium   | A server could serve an old secrets version (correctly numbered) as the latest, or report an old key version so new pushes used a key a removed member still had | `trust.json` remembers the newest version and key version; older ones are refused       |
| Medium   | After the first contact, nothing stopped a server from swapping a teammate's or token's public key before a grant or rotation                                    | `trust.json` pins public keys on first sight; a change is refused                       |
| Medium   | Anyone who learned a session id could end that session by refreshing with a made-up token; a non-UUID session id caused a 500                                    | Only the previous token counts as reuse; ids are checked first                          |
| Low      | The refresh cookie could be used by any page on the same site (for example another subdomain)                                                                    | Cookie refreshes need `Origin` = `WEB_URL`                                              |
| Low      | The CLI accepted any `http://` server address, and production config accepted `http://` URLs                                                                     | `https://` required, except `http://` on loopback                                       |
| Low      | The web dashboard relied on the host for CSP and referrer headers                                                                                                | CSP and `no-referrer` built into every page                                             |
| Low      | Atomic writes used a predictable temporary name (`<file>.<pid>.tmp`)                                                                                             | Random name, created exclusively                                                        |
| Low      | Release and CI actions were pinned by movable tags; checkouts kept the git token; releases had no provenance                                                     | Pinned to SHAs, `persist-credentials: false`, signed build provenance                   |

Checked and found sound: authenticated encryption and AAD binding, Argon2id
bounds, recovery key checksums, constant-time hash comparisons, JWT
algorithm pinning, session checks on every request, OAuth `state`, role
checks ("not found" for non-members), service-token scoping, request
validation that never echoes values, logger redaction, the browser key wipe.

Not changed, worth knowing:

- `envy run` passes every variable to the command, including ones such as
  `NODE_OPTIONS` or `LD_PRELOAD` that change what a program loads. Anyone who
  can push to an environment can therefore run code on teammates' machines
  that use `envy run`. Pushing needs the member role, which is trusted.
- The OAuth device flow can be phished like any device flow: only approve a
  code you started yourself.
- Release downloads are checked against `checksums.txt` from the same
  release; use `gh attestation verify` for a check that does not trust the
  release page.

## Known limits (unchanged)

- A malicious server can swap a public key during an invite; comparing
  fingerprints is the defence.
- JavaScript cannot guarantee that zeroed buffers have no other copies.
- A leaked service token can read its environment until revoked or expired.

## Third audit (2026-11-23)

A full review of the crypto package, CLI, API and web dashboard, with the
server treated as hostile, as the threat model says. Two findings were
confirmed with working attacks before they were fixed. The fixes are in
ADR 0016 and ADR 0017.

| Severity | Finding                                                                                                                                                                                                      | Fix                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| High     | Wrapped environment keys were anonymous sealed boxes. A server could make its own key as a new key version and read every later push, or serve made-up secrets (such as `NODE_OPTIONS`) to `envy run` and CI | Format 2 wrapped keys prove their sender and are bound to environment and key version; clients accept only trusted senders |
| High     | Every member key the CLI had not seen was trusted silently, so a server could add a fake member and the next rotation or `envy env add` wrapped the new key for it                                           | Trust on first use once per project; afterwards a new key needs its fingerprint confirmed                                  |
| Medium   | The web dashboard had none of the CLI's trust checks: no pinned keys, no rollback check, keys wrapped for whatever the server listed                                                                         | Same rules as the CLI, shared in `packages/shared`, stored in browser storage                                              |
| Medium   | `envy pull` skipped the symbolic link check when the file did not exist yet, so a committed folder link let it write outside the project                                                                     | The real path of the nearest existing folder is checked                                                                    |
| Medium   | The recovery key could not be used and the master password could not be changed                                                                                                                              | `envy password`, `envy recover` and the same in the dashboard, behind a proof of the private key                           |
| Low      | Drizzle put query values (wrapped keys, ciphertext, emails) in error messages, which the logger wrote out on unexpected database errors                                                                      | Errors are logged by name, query text and Postgres code only                                                               |
| Low      | Forgetting `APP_ENV=production` sent the refresh cookie without `Secure` and skipped HSTS                                                                                                                    | An https `API_URL` turns both on; a warning for a public address without production                                        |
| Low      | Double-quoted `.env` values did not escape `$` or backticks, so `source .env` could run a pushed command                                                                                                     | Both are escaped, and read back by the parser                                                                              |
| Low      | Creating an environment, granting and removing a member checked their lists outside the transaction, so a member removed at the same moment could keep a key                                                 | A row lock on the project, and the checks inside the transaction                                                           |

Checked and found sound: AEAD use and AAD binding, Argon2id bounds, recovery
key checksums, JWT algorithm pinning, refresh rotation and reuse detection,
OAuth `state`, the cookie refresh origin check, verified emails for invites,
role checks, service-token scoping, soft-deleted projects, input validation,
rate-limit addresses, CSP, the browser key wipe, the install script and
upgrade checksums, actions pinned to SHAs.

Still open, worth knowing (also in ADR 0016 and the threat model):

- A service token in CI trusts the first sender it sees, because it has
  nobody to ask and usually no saved state.
- A removed member working with the server can still make a key that other
  devices accept.
- The dashboard is only as trustworthy as whoever serves its JavaScript.
