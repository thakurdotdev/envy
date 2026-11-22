# Security review (Phase 8)

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

## Known limits (unchanged)

- A malicious server can swap a public key during an invite; comparing
  fingerprints is the defence.
- JavaScript cannot guarantee that zeroed buffers have no other copies.
- A leaked service token can read its environment until revoked or expired.
