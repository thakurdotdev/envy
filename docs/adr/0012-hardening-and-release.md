# ADR 0012: Hardening and release

- Status: Accepted
- Date: 2026-11-22

## Decision

- **Security headers on every API response**, errors included: `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `Content-Security-Policy: default-src 'none'`, CORP `same-site`,
  `Cache-Control: no-store`, and HSTS when `APP_ENV=production`. The static
  web's headers are set by Shipyard (`docs/deploy.md`).
- **Write rate limits:** every POST, PUT, PATCH and DELETE counts against the
  caller's IP and, once signed in, against the user or token: 120 per minute
  each, in memory (same limits as ADR 0006 for several instances).
- **Release binaries are built natively per platform** (Linux x64/arm64,
  macOS arm64/x64, Windows x64) because `@napi-rs/keyring` is a native module
  (ADR 0002). Each binary is smoke-tested in CI, including a real OS keychain
  write and read; this replaces the manual macOS check ADR 0002 asked for.
  The tag must match `apps/cli/package.json` `version`.
- **The default API URL is baked in at build time** from the repository
  variable `ENVY_API_URL` (`--define process.env.ENVY_BUILD_API_URL`), so a
  downloaded binary needs no setup. Local builds still default to localhost.
- **Install script** (`scripts/install.sh`, POSIX sh): picks the binary for
  the OS and CPU, verifies it against `checksums.txt`, installs to
  `~/.local/bin` (or `ENVY_INSTALL_DIR`), and refuses a mismatched download.
  `envy upgrade` does the same check before replacing itself.
- **Deployment stays with the owner's Shipyard**; `docs/deploy.md` lists the
  exact build, start and release commands, the database set-up (database
  `envy` owned by the existing `appuser`), and the nightly backup cron. No
  Dockerfiles, systemd units or deploy scripts.

## Consequences

- The repository's releases must be public for the install script and
  `envy upgrade`.
- The plan's final check (a new user follows only the README) can run once
  the API and web are deployed and `v0.1.0` is tagged.
