# ADR 0011: Service tokens and CLI polish

- Status: Accepted
- Date: 2026-11-22

## Context

Phase 7 makes Envy work in CI with read-only service tokens, and finishes
the CLI (`doctor`, `completion`, the menu, `--json`, `.env.example` checks).

## Decision

### Service tokens

- **Format:** `envy_<tokenId>_<privateKey>`: 24 random bytes as hex, then the
  token's X25519 private key in base64url. Both are made on the client.
- **Only `envy_<tokenId>` is ever sent** (as `Authorization: Bearer envy_…`).
  The plan's wording could be read as sending the whole token; that would
  give the server the private key and break zero-knowledge, so the private
  part never leaves the machine.
- **The server stores** the SHA-256 of the token id (the client sends the
  hash at creation, so the server never sees the id until first use), the
  token's public key, and the environment key wrapped for it
  (`environment_keys` with `recipient_type = token`).
- **What a token can do:** list its project's environments (it sees only its
  own), read its environment's wrapped key and secrets, and
  `GET /v1/tokens/current`. Everything else answers 403 `TOKEN_NOT_ALLOWED`,
  and other environments answer 404. Tokens do not read the shared layer,
  because the plan limits a token to one environment.
- **Actors are a union** (`user` or `token`). Code that needs a person calls
  `requireUser`, so the type checker finds every place a token must be
  refused.
- **Key rotation re-wraps for tokens:** a rotation must include the new key
  wrapped for every active token of that environment
  (`tokenWrappedKeys`), so removing a member does not silently break CI.
- **Expiry and revoke:** optional `--expires <days>d`; revoked or expired
  tokens get 401 `TOKEN_NOT_FOUND`. Each use updates `last_used_at`.
- **With `ENVY_TOKEN` set,** `run`, `pull` and `get` need no login and no
  `.envy.json`; the token names its project and environment.

### CLI polish

- `envy doctor [--json]` checks the server, sign-in (or token), keychain,
  `.envy.json`, `.gitignore`, access to the environment and missing keys,
  and exits 1 when something is broken.
- `envy completion bash|zsh|fish` prints a script built from the command list.
- `envy` alone shows a menu in a terminal and the help text otherwise.
- `--json` on `get`, `history`, `members ls`, `env ls`, `token ls` and `doctor`.
- `envy env ls` and `envy env add <name> [--protected]` (removing an
  environment needs an API route that does not exist yet).
- `run` and `pull` warn about keys in `.env.example` that the environment
  does not set.

## Consequences

- The README's CI example installs envy with the install script from
  Phase 8; until then, CI must download the binary another way.
- Removing an environment (`envy env rm`) is still open.
