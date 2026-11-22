# Changelog

## Unreleased

- Install script: shows the platform and version, says which version it updates from, shows a download progress bar, skips an install that is already up to date, and prints the exact PATH line for your shell.
- `envy upgrade` (also `envy update`): shows the current and new version, a progress bar and the release notes link; adds `--check`, `--force` and picking a version; works on Windows.
- `envy login` copies the sign-in code to your clipboard before opening GitHub.

## 0.1.0 (2026-11-22)

First release.

- Zero-knowledge sharing of `.env` secrets: everything is encrypted on your machine or in your browser (Argon2id master password, X25519 keys, XChaCha20-Poly1305 with context binding). The server stores only ciphertext and wrapped keys.
- CLI: `login`, `init`, `pull`, `push`, `run`, `set`, `unset`, `get`, `use`, `env`, `history`, `rollback`, `members`, `accept`, `token`, `doctor`, `completion`, `upgrade`.
- Teams: email-bound invites, fingerprint-checked grants, roles, removal with automatic key rotation.
- CI: read-only service tokens (`ENVY_TOKEN`) for one environment.
- Web dashboard: projects, a secret editor with a table and a .env view (paste or drop a whole .env), history and rollback, members, service tokens, audit log, devices.
- Website: landing page, docs, and the install script at `https://envy.thakur.dev/install.sh`.
- Hardening: security headers, CORS allow-list, body size limits, rate limits on sign-in and every write.
