# ADR 0008: CLI behaviour

- Status: Accepted
- Date: 2026-11-22

## Context

Phase 4 builds `envy login`, `init`, `pull`, `push`, `run`, `set`, `unset`,
`get` and `use`. The plan sets the user experience; these are the details it
leaves open.

## Decision

### Settings and storage

- **Environment variables** for scripts and tests: `ENVY_API_URL`,
  `ENVY_ENV`, `ENVY_CONFIG_DIR` (default `~/.config/envy`),
  `ENVY_KEYSTORE=keychain|file`, `ENVY_MASTER_PASSWORD`, `ENVY_NO_BROWSER`,
  `ENVY_DEBUG=1`, and `DO_NOT_TRACK` / `ENVY_NO_ANALYTICS` (ADR 0015).
  `ENVY_MASTER_PASSWORD` exists so a person can script their
  own machine; CI should use service tokens (Phase 7).
- **Default API URL is `http://localhost:3000`** until a public server exists.
  `envy login --api-url <url>` saves another one in `config.json`.
- **Keystore:** the OS keychain (`@napi-rs/keyring`) holds the session tokens
  and the unlocked private key. If the keychain does not work, a `0600`
  `credentials.json` holds the session tokens only; the private key is never
  written there, so each command asks for the master password (or reads
  `ENVY_MASTER_PASSWORD`). This is simpler than the plan's "file encrypted by
  a key in the keychain": when there is no keychain there is nowhere to keep
  that key, and session tokens in a `0600` file is what most CLIs do.
- **Token refresh runs under a lock folder** in the config folder, and
  re-reads the stored tokens after getting the lock, so two `envy` processes
  never present the same refresh token (ADR 0006).
- **`state.json` remembers the last version pulled or pushed** per
  environment on this machine.

### Commands

- **`init`** takes `--project <name|id>`, `--create <name>`, `--yes` (import
  without asking) and `--force` (re-link). `.env` goes to `development`,
  `.env.<name>` to the environment of that name (and wins over `.env` for
  development). `.env.example`, `.env.sample`, `.env.template` and
  `*.local` files are never imported. Files are only imported into empty
  environments. `.gitignore` gets `.env`, `.env.*` and `!.env.example`.
- **The shared layer:** `pull`, `run` and `get` merge `shared` under the
  chosen environment. `push` sends the file back without keys that came from
  `shared` unchanged, so they are not copied into the environment; changing
  such a key in the file makes it an environment override.
- **Conflicts:** `push` uses the version this machine last pulled. If the
  server has a newer one, it shows what the push would change and asks; with
  no terminal it fails and says to pull first or pass `--force`. `--yes`
  confirms the diff but never overrides a conflict.
- **Protected environments** need `--env <name>` and a confirmation (or
  `--yes`) for every command, and `envy use` refuses to make one the default.
- **`run`** gives the secrets priority over variables already set in the
  shell, forwards SIGINT, SIGTERM and SIGHUP to the child, and exits with the
  child's code (128 + signal number when it was killed by a signal).
- **`set KEY`** without `=value` asks for the value without echoing it, which
  keeps it out of the shell history.
- **Output:** results (`envy get`) go to stdout; progress, diffs and errors
  go to stderr. Diffs show key names only.

### Testing

- The end-to-end test compiles the real binary and runs it against a real API
  server with a fake GitHub. To do that it imports `@envy/api/testing`; that
  export is for tests only, and CLI source code still imports nothing but
  `type App` from the API.

## Consequences

- When a public server exists, change `DEFAULT_API_URL` in
  `apps/cli/src/core/settings.ts`.
- Teams that put secrets only in `shared` must use `envy push --env shared`
  to change them.
